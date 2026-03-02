const { v4: uuidv4 } = require("uuid");
const {
    StreamCircle,
    StreamCircleMember,
    StreamReport,
    User,
    Notification,
    getAuthDisplayName,
    normalizeVisibility,
    parseBoolean,
    createUniqueSlug,
    resolveCircleByIdentifier,
    getActiveMembership,
    canAccessCircle,
    canManageCircle,
    serializeCircle,
    toIsoNow,
    refreshCircleStats,
    refreshCircleReportSummary,
} = require("./shared");

function mountPublicCircleRoutes(router, { requireFeedRead, requireFollowWrite, emitNotificationEvent }) {
    // GET /circles?joined=1&q=...
    router.get("/circles", ...requireFeedRead, async (req, res) => {
        try {
            const authUser = req.auth?.user;
            const authUserId = String(authUser?.id || "");
            const isAdmin = String(authUser?.role || "").toLowerCase() === "admin";
            const q = String(req.query.q || "").trim();
            const joinedOnly = parseBoolean(req.query.joined);
            const visibilityFilterRaw = String(req.query.visibility || "").trim().toLowerCase();
            const visibilityFilter =
                visibilityFilterRaw === "public" || visibilityFilterRaw === "closed" || visibilityFilterRaw === "secret"
                    ? visibilityFilterRaw
                    : null;
            const limitRaw = Number.parseInt(String(req.query.limit || "24"), 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 80) : 24;

            const circleQuery = {};
            if (q) circleQuery.$text = { $search: q };
            if (visibilityFilter && !joinedOnly) circleQuery.visibility = visibilityFilter;

            let circles;
            if (circleQuery.$text) {
                circles = await StreamCircle.find(circleQuery, { score: { $meta: "textScore" } })
                    .sort({ score: { $meta: "textScore" }, updated_at: -1 })
                    .limit(300);
            } else {
                circles = await StreamCircle.find(circleQuery).sort({ updated_at: -1 }).limit(300);
            }

            const circleIds = circles.map((circle) => String(circle.id || "")).filter(Boolean);
            const memberships = authUserId
                ? await StreamCircleMember.find({
                    circle_id: { $in: circleIds },
                    user_id: authUserId,
                    status: "active",
                })
                : [];
            const membershipMap = new Map(memberships.map((membership) => [String(membership.circle_id), membership]));

            circles = circles.filter((circle) => {
                const membership = membershipMap.get(String(circle.id || ""));
                if (joinedOnly) return Boolean(membership);
                if (isAdmin) return true;
                if (String(circle.visibility || "public") === "public") return true;
                return Boolean(membership);
            });

            const limitedCircles = circles.slice(0, limit);
            return res.json({
                success: true,
                circles: limitedCircles.map((circle) =>
                    serializeCircle(circle, membershipMap.get(String(circle.id || "")) || null)
                ),
                count: limitedCircles.length,
            });
        } catch (error) {
            console.error("Error listing stream circles:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch circles" });
        }
    });

    // GET /circles/me
    router.get("/circles/me", ...requireFeedRead, async (req, res) => {
        try {
            const authUserId = String(req.auth?.user?.id || "");
            if (!authUserId) return res.status(401).json({ success: false, message: "Authentication required" });

            const limitRaw = Number.parseInt(String(req.query.limit || "40"), 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 40;

            const memberships = await StreamCircleMember.find({
                user_id: authUserId,
                status: "active",
            })
                .sort({ updated_at: -1, joined_at: -1 })
                .limit(limit);

            const circleIds = memberships.map((membership) => String(membership.circle_id || "")).filter(Boolean);
            const circles = await StreamCircle.find({ id: { $in: circleIds } });
            const circleMap = new Map(circles.map((circle) => [String(circle.id || ""), circle]));

            const ordered = memberships
                .map((membership) => ({
                    circle: circleMap.get(String(membership.circle_id || "")),
                    membership,
                }))
                .filter((entry) => Boolean(entry.circle))
                .map((entry) => serializeCircle(entry.circle, entry.membership));

            return res.json({
                success: true,
                circles: ordered,
                count: ordered.length,
            });
        } catch (error) {
            console.error("Error listing joined circles:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch joined circles" });
        }
    });

    // POST /circles
    router.post("/circles", ...requireFollowWrite, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const name = String(req.body?.name || "").trim();
            const description = String(req.body?.description || "").trim().slice(0, 320);
            const visibility = normalizeVisibility(req.body?.visibility);
            const avatarUrl = String(req.body?.avatar_url || req.body?.avatarUrl || "").trim();
            const coverUrl = String(req.body?.cover_url || req.body?.coverUrl || "").trim();

            if (name.length < 2) {
                return res.status(400).json({ success: false, message: "Circle name must be at least 2 characters" });
            }
            if (name.length > 80) {
                return res.status(400).json({ success: false, message: "Circle name must be 80 characters or less" });
            }

            const slug = await createUniqueSlug(name);
            const now = toIsoNow();
            const userRecord = await User.findOne({ id: String(authUser.id || "") });
            const ownerName = getAuthDisplayName(authUser, "Member");
            const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};

            const circle = await new StreamCircle({
                id: uuidv4(),
                slug,
                name,
                description,
                visibility,
                owner_user_id: String(authUser.id || ""),
                owner_name: ownerName,
                avatar_url: avatarUrl || String(userRecord?.avatar_url || ""),
                cover_url: coverUrl,
                member_count: 1,
                post_count: 0,
                metadata,
                created_at: now,
                updated_at: now,
            }).save();

            const ownerMembership = await new StreamCircleMember({
                id: uuidv4(),
                circle_id: String(circle.id),
                user_id: String(authUser.id || ""),
                user_name: ownerName,
                role: "owner",
                status: "active",
                joined_at: now,
                created_at: now,
                updated_at: now,
                metadata: {},
            }).save();

            return res.status(201).json({
                success: true,
                circle: serializeCircle(circle, ownerMembership),
            });
        } catch (error) {
            console.error("Error creating stream circle:", error);
            return res.status(500).json({ success: false, message: "Failed to create circle" });
        }
    });

    // GET /circles/:identifier
    router.get("/circles/:identifier", ...requireFeedRead, async (req, res) => {
        try {
            const authUser = req.auth?.user;
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const membership = await getActiveMembership(circle.id, authUser?.id);
            if (!canAccessCircle({ circle, membership, authUser })) {
                return res.status(403).json({ success: false, message: "You do not have access to this circle" });
            }

            return res.json({
                success: true,
                circle: serializeCircle(circle, membership),
            });
        } catch (error) {
            console.error("Error fetching stream circle:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch circle" });
        }
    });

    // PATCH /circles/:identifier
    router.patch("/circles/:identifier", ...requireFollowWrite, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const membership = await getActiveMembership(circle.id, authUser?.id);
            if (!canManageCircle({ circle, membership, authUser })) {
                return res.status(403).json({ success: false, message: "You do not have permission to update this circle" });
            }

            if (req.body?.name !== undefined) {
                const name = String(req.body.name || "").trim();
                if (name.length < 2 || name.length > 80) {
                    return res.status(400).json({ success: false, message: "Circle name must be 2-80 characters" });
                }
                circle.name = name;
            }

            if (req.body?.description !== undefined) {
                circle.description = String(req.body.description || "").trim().slice(0, 320);
            }
            if (req.body?.visibility !== undefined) {
                circle.visibility = normalizeVisibility(req.body.visibility);
            }
            if (req.body?.avatar_url !== undefined || req.body?.avatarUrl !== undefined) {
                circle.avatar_url = String(req.body?.avatar_url || req.body?.avatarUrl || "").trim();
            }
            if (req.body?.cover_url !== undefined || req.body?.coverUrl !== undefined) {
                circle.cover_url = String(req.body?.cover_url || req.body?.coverUrl || "").trim();
            }
            if (req.body?.metadata !== undefined && req.body?.metadata && typeof req.body.metadata === "object") {
                circle.metadata = req.body.metadata;
            }

            circle.updated_at = toIsoNow();
            await circle.save();

            return res.json({
                success: true,
                circle: serializeCircle(circle, membership),
            });
        } catch (error) {
            console.error("Error updating stream circle:", error);
            return res.status(500).json({ success: false, message: "Failed to update circle" });
        }
    });

    // POST /circles/:identifier/report
    router.post("/circles/:identifier/report", ...requireFollowWrite, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const authUserId = String(authUser.id || "");
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const membership = await getActiveMembership(circle.id, authUserId);
            if (!canAccessCircle({ circle, membership, authUser })) {
                return res.status(403).json({ success: false, message: "You do not have access to this circle" });
            }

            const reason = String(req.body?.reason || "other").trim().slice(0, 80) || "other";
            const note = String(req.body?.note || "").trim().slice(0, 500);
            const now = toIsoNow();

            const existing = await StreamReport.findOne({
                target_type: "circle",
                target_id: String(circle.id),
                reporter_user_id: authUserId,
                status: { $in: ["open", "under_review"] },
            }).sort({ updated_at: -1, created_at: -1 });

            let report;
            if (existing) {
                existing.reason = reason;
                existing.note = note;
                existing.status = "open";
                existing.updated_at = now;
                report = await existing.save();
            } else {
                report = await new StreamReport({
                    id: uuidv4(),
                    target_type: "circle",
                    target_id: String(circle.id),
                    post_id: "",
                    reply_id: null,
                    reported_user_id: String(circle.owner_user_id || ""),
                    reporter_user_id: authUserId,
                    reporter_name: getAuthDisplayName(authUser, "Member"),
                    reason,
                    note,
                    status: "open",
                    resolved_by_user_id: null,
                    resolved_by_name: null,
                    resolved_at: null,
                    metadata: {
                        circle_name: String(circle.name || ""),
                        circle_slug: String(circle.slug || ""),
                    },
                    created_at: now,
                    updated_at: now,
                }).save();
            }

            const reportCount = await refreshCircleReportSummary(circle.id);
            return res.status(201).json({
                success: true,
                message: "Circle report submitted",
                circle: serializeCircle(circle, membership),
                report: {
                    id: String(report.id || ""),
                    target_type: String(report.target_type || "circle"),
                    target_id: String(report.target_id || ""),
                    reason: String(report.reason || "other"),
                    note: String(report.note || ""),
                    status: String(report.status || "open"),
                    created_at: report.created_at,
                    updated_at: report.updated_at,
                },
                report_count: reportCount,
            });
        } catch (error) {
            console.error("Error reporting stream circle:", error);
            return res.status(500).json({ success: false, message: "Failed to report circle" });
        }
    });

    // POST /circles/:identifier/join
    router.post("/circles/:identifier/join", ...requireFollowWrite, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const authUserId = String(authUser.id || "");
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const isAdmin = String(authUser.role || "").toLowerCase() === "admin";
            if (String(circle.visibility || "public") === "secret" && !isAdmin) {
                return res.status(403).json({ success: false, message: "Secret circles require an invite" });
            }

            const now = toIsoNow();
            const existing = await StreamCircleMember.findOne({
                circle_id: String(circle.id),
                user_id: authUserId,
            });
            let membership;

            if (existing) {
                if (String(existing.status || "") === "active") {
                    membership = existing;
                } else {
                    existing.status = "active";
                    existing.updated_at = now;
                    existing.joined_at = existing.joined_at || now;
                    existing.user_name = getAuthDisplayName(authUser, "Member");
                    if (!existing.role) existing.role = "member";
                    membership = await existing.save();
                }
            } else {
                membership = await new StreamCircleMember({
                    id: uuidv4(),
                    circle_id: String(circle.id),
                    user_id: authUserId,
                    user_name: getAuthDisplayName(authUser, "Member"),
                    role: "member",
                    status: "active",
                    joined_at: now,
                    created_at: now,
                    updated_at: now,
                    metadata: {},
                }).save();
            }

            const stats = await refreshCircleStats(circle.id);
            circle.member_count = stats.member_count;
            circle.post_count = stats.post_count;
            circle.updated_at = toIsoNow();

            const ownerUserId = String(circle.owner_user_id || "");
            if (ownerUserId && ownerUserId !== authUserId) {
                const now = toIsoNow();
                const notification = await new Notification({
                    id: uuidv4(),
                    user_id: ownerUserId,
                    type: "system",
                    message: `${getAuthDisplayName(authUser, "Member")} joined ${circle.name}`,
                    post_id: null,
                    post_title: circle.name,
                    metadata: {
                        kind: "stream_circle_join",
                        stream_circle_id: String(circle.id),
                        stream_circle_slug: String(circle.slug || ""),
                        actor_user_id: authUserId,
                        actor_name: getAuthDisplayName(authUser, "Member"),
                    },
                    is_read: false,
                    created_at: now,
                    read_at: null,
                }).save();
                if (emitNotificationEvent) emitNotificationEvent(notification);
            }

            return res.json({
                success: true,
                joined: true,
                circle: serializeCircle(circle, membership),
            });
        } catch (error) {
            console.error("Error joining stream circle:", error);
            return res.status(500).json({ success: false, message: "Failed to join circle" });
        }
    });

    // POST /circles/:identifier/leave
    router.post("/circles/:identifier/leave", ...requireFollowWrite, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const authUserId = String(authUser.id || "");
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const existing = await StreamCircleMember.findOne({
                circle_id: String(circle.id),
                user_id: authUserId,
                status: "active",
            });

            if (!existing) {
                return res.json({
                    success: true,
                    joined: false,
                    circle: serializeCircle(circle, null),
                });
            }

            const isAdmin = String(authUser.role || "").toLowerCase() === "admin";
            if (String(existing.role || "") === "owner" && !isAdmin) {
                return res.status(400).json({
                    success: false,
                    message: "Circle owner cannot leave. Transfer ownership or delete circle.",
                });
            }

            existing.status = "removed";
            existing.updated_at = toIsoNow();
            await existing.save();

            const stats = await refreshCircleStats(circle.id);
            circle.member_count = stats.member_count;
            circle.post_count = stats.post_count;
            circle.updated_at = toIsoNow();

            return res.json({
                success: true,
                joined: false,
                circle: serializeCircle(circle, null),
            });
        } catch (error) {
            console.error("Error leaving stream circle:", error);
            return res.status(500).json({ success: false, message: "Failed to leave circle" });
        }
    });
}

module.exports = mountPublicCircleRoutes;
