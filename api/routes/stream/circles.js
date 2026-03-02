const { v4: uuidv4 } = require("uuid");
const {
    StreamCircle, StreamCircleMember, StreamPost, User,
    Notification,
    serializePost,
    buildViewerReactionMap, buildViewerBookmarkSet, buildViewerRestreamSet,
    getAuthDisplayName,
} = require("./_helpers");

function normalizeVisibility(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "closed" || normalized === "secret") return normalized;
    return "public";
}

function normalizeCircleRole(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "owner" || normalized === "moderator") return normalized;
    return "member";
}

function toIsoNow() {
    return new Date().toISOString();
}

function parseBoolean(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

function createSlug(input) {
    const base = String(input || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    return base || `circle-${Math.random().toString(36).slice(2, 8)}`;
}

async function createUniqueSlug(name) {
    const base = createSlug(name);
    let candidate = base;
    let attempts = 0;

    while (attempts < 20) {
        const existing = await StreamCircle.findOne({ slug: candidate });
        if (!existing) return candidate;
        attempts += 1;
        candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }

    return `${base}-${Date.now().toString(36)}`;
}

async function resolveCircleByIdentifier(identifier) {
    const normalized = String(identifier || "").trim();
    if (!normalized) return null;
    return StreamCircle.findOne({
        $or: [{ id: normalized }, { slug: normalized }],
    });
}

async function getActiveMembership(circleId, userId) {
    const normalizedCircleId = String(circleId || "");
    const normalizedUserId = String(userId || "");
    if (!normalizedCircleId || !normalizedUserId) return null;
    return StreamCircleMember.findOne({
        circle_id: normalizedCircleId,
        user_id: normalizedUserId,
        status: "active",
    });
}

function canAccessCircle({ circle, membership, authUser }) {
    if (!circle) return false;
    if (String(authUser?.role || "").toLowerCase() === "admin") return true;
    if (String(circle.visibility || "public") === "public") return true;
    return Boolean(membership);
}

function canManageCircle({ circle, membership, authUser }) {
    if (!circle) return false;
    if (String(authUser?.role || "").toLowerCase() === "admin") return true;
    if (String(circle.owner_user_id || "") === String(authUser?.id || "")) return true;
    const membershipRole = String(membership?.role || "");
    return membershipRole === "owner" || membershipRole === "moderator";
}

function canPromoteCircleMembers({ circle, membership, authUser }) {
    if (!circle) return false;
    if (String(authUser?.role || "").toLowerCase() === "admin") return true;
    if (String(circle.owner_user_id || "") === String(authUser?.id || "")) return true;
    return String(membership?.role || "") === "owner";
}

async function resolveUserByIdentifier(identifier) {
    const normalized = String(identifier || "").trim();
    if (!normalized) return null;
    const lower = normalized.toLowerCase();
    return User.findOne({
        $or: [{ id: normalized }, { username: normalized }, { email: lower }, { email: normalized }],
    });
}

function serializeCircleMember(member) {
    return {
        id: String(member.id || ""),
        user_id: String(member.user_id || ""),
        user_name: String(member.user_name || "Member"),
        role: String(member.role || "member"),
        status: String(member.status || "active"),
        joined_at: member.joined_at || member.created_at,
        created_at: member.created_at,
        updated_at: member.updated_at,
        metadata: member.metadata && typeof member.metadata === "object" ? member.metadata : {},
    };
}

function serializeCircle(circle, membership = null) {
    return {
        id: String(circle.id || ""),
        slug: String(circle.slug || ""),
        name: String(circle.name || ""),
        description: String(circle.description || ""),
        visibility: String(circle.visibility || "public"),
        owner_user_id: String(circle.owner_user_id || ""),
        owner_name: String(circle.owner_name || ""),
        avatar_url: String(circle.avatar_url || ""),
        cover_url: String(circle.cover_url || ""),
        member_count: Number(circle.member_count || 0),
        post_count: Number(circle.post_count || 0),
        metadata: circle.metadata && typeof circle.metadata === "object" ? circle.metadata : {},
        created_at: circle.created_at,
        updated_at: circle.updated_at,
        viewer_membership: membership
            ? {
                role: String(membership.role || "member"),
                status: String(membership.status || "active"),
                joined_at: membership.joined_at || membership.created_at,
            }
            : null,
        is_member: Boolean(membership),
    };
}

async function refreshCircleStats(circleId) {
    const normalizedCircleId = String(circleId || "");
    if (!normalizedCircleId) return { member_count: 0, post_count: 0 };

    const [memberCount, postCount] = await Promise.all([
        StreamCircleMember.countDocuments({ circle_id: normalizedCircleId, status: "active" }),
        StreamPost.countDocuments({ "metadata.circle_id": normalizedCircleId }),
    ]);

    await StreamCircle.updateOne(
        { id: normalizedCircleId },
        {
            $set: {
                member_count: Number(memberCount || 0),
                post_count: Number(postCount || 0),
                updated_at: toIsoNow(),
            },
        }
    );

    return {
        member_count: Number(memberCount || 0),
        post_count: Number(postCount || 0),
    };
}

function mountCircleRoutes(
    router,
    { requireFeedRead, requireFollowWrite, requireStreamModerate, requireStreamFeature, emitNotificationEvent }
) {
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

    // GET /circles/:identifier/members
    router.get("/circles/:identifier/members", ...requireFeedRead, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const membership = await getActiveMembership(circle.id, authUser?.id);
            if (!canAccessCircle({ circle, membership, authUser })) {
                return res.status(403).json({ success: false, message: "You do not have access to this circle" });
            }

            const limitRaw = Number.parseInt(String(req.query.limit || "50"), 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 120) : 50;
            const members = await StreamCircleMember.find({
                circle_id: String(circle.id),
                status: "active",
            })
                .sort({ role: 1, joined_at: -1 })
                .limit(limit);

            return res.json({
                success: true,
                circle: serializeCircle(circle, membership),
                can_manage: canManageCircle({ circle, membership, authUser }),
                can_promote: canPromoteCircleMembers({ circle, membership, authUser }),
                members: members.map((member) => serializeCircleMember(member)),
            });
        } catch (error) {
            console.error("Error listing stream circle members:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch members" });
        }
    });

    // POST /circles/:identifier/invite
    router.post("/circles/:identifier/invite", ...requireFollowWrite, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const managerMembership = await getActiveMembership(circle.id, authUser?.id);
            if (!canManageCircle({ circle, membership: managerMembership, authUser })) {
                return res.status(403).json({ success: false, message: "You do not have permission to invite members" });
            }

            const userIdentifier = String(
                req.body?.user_id || req.body?.userId || req.body?.username || req.body?.email || ""
            ).trim();
            if (!userIdentifier) {
                return res.status(400).json({ success: false, message: "Invite target is required" });
            }
            const targetUser = await resolveUserByIdentifier(userIdentifier);
            if (!targetUser) {
                return res.status(404).json({ success: false, message: "Invite target not found" });
            }

            const targetUserId = String(targetUser.id || "");
            const targetRoleRequested = normalizeCircleRole(req.body?.role);
            const targetRole =
                targetRoleRequested === "owner" && !canPromoteCircleMembers({ circle, membership: managerMembership, authUser })
                    ? "member"
                    : targetRoleRequested;

            const now = toIsoNow();
            let member = await StreamCircleMember.findOne({
                circle_id: String(circle.id),
                user_id: targetUserId,
            });

            if (member) {
                member.status = "active";
                if (String(member.role || "") !== "owner") {
                    member.role = targetRole;
                }
                member.user_name =
                    [String(targetUser.first_name || ""), String(targetUser.last_name || "")]
                        .filter(Boolean)
                        .join(" ")
                        .trim() || String(targetUser.username || targetUser.email || "Member");
                member.updated_at = now;
                member.joined_at = member.joined_at || now;
                await member.save();
            } else {
                member = await new StreamCircleMember({
                    id: uuidv4(),
                    circle_id: String(circle.id),
                    user_id: targetUserId,
                    user_name:
                        [String(targetUser.first_name || ""), String(targetUser.last_name || "")]
                            .filter(Boolean)
                            .join(" ")
                            .trim() || String(targetUser.username || targetUser.email || "Member"),
                    role: targetRole,
                    status: "active",
                    joined_at: now,
                    created_at: now,
                    updated_at: now,
                    metadata: {
                        invited_by_user_id: String(authUser.id || ""),
                        invited_by_name: getAuthDisplayName(authUser, "Member"),
                        invited_at: now,
                    },
                }).save();
            }

            const stats = await refreshCircleStats(circle.id);
            circle.member_count = stats.member_count;
            circle.post_count = stats.post_count;
            circle.updated_at = now;

            if (targetUserId !== String(authUser.id || "")) {
                const notification = await new Notification({
                    id: uuidv4(),
                    user_id: targetUserId,
                    type: "system",
                    message: `${getAuthDisplayName(authUser, "Member")} invited you to ${circle.name}`,
                    post_id: null,
                    post_title: circle.name,
                    metadata: {
                        kind: "stream_circle_invite",
                        stream_circle_id: String(circle.id),
                        stream_circle_slug: String(circle.slug || ""),
                        actor_user_id: String(authUser.id || ""),
                        actor_name: getAuthDisplayName(authUser, "Member"),
                        role: String(member.role || "member"),
                    },
                    is_read: false,
                    created_at: now,
                    read_at: null,
                }).save();
                if (emitNotificationEvent) emitNotificationEvent(notification);
            }

            return res.status(201).json({
                success: true,
                invited: true,
                circle: serializeCircle(circle, managerMembership),
                member: serializeCircleMember(member),
            });
        } catch (error) {
            console.error("Error inviting stream circle member:", error);
            return res.status(500).json({ success: false, message: "Failed to invite member" });
        }
    });

    // PATCH /circles/:identifier/members/:userId
    router.patch("/circles/:identifier/members/:userId", ...requireFollowWrite, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const targetUserId = String(req.params.userId || "");
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const managerMembership = await getActiveMembership(circle.id, authUser?.id);
            if (!canManageCircle({ circle, membership: managerMembership, authUser })) {
                return res.status(403).json({ success: false, message: "You do not have permission to manage members" });
            }

            const member = await StreamCircleMember.findOne({
                circle_id: String(circle.id),
                user_id: targetUserId,
            });
            if (!member) return res.status(404).json({ success: false, message: "Circle member not found" });

            const now = toIsoNow();
            const nextStatusRaw = String(req.body?.status || "").trim().toLowerCase();
            const nextStatus =
                nextStatusRaw === "removed" || nextStatusRaw === "active" ? nextStatusRaw : null;
            const requestedRole = req.body?.role !== undefined ? normalizeCircleRole(req.body?.role) : null;

            if (String(member.role || "") === "owner" && requestedRole && requestedRole !== "owner") {
                return res.status(400).json({
                    success: false,
                    message: "Owner role cannot be downgraded through this endpoint",
                });
            }
            if (String(member.role || "") === "owner" && nextStatus === "removed") {
                return res.status(400).json({
                    success: false,
                    message: "Owner cannot be removed from the circle",
                });
            }
            if (requestedRole === "owner" && !canPromoteCircleMembers({ circle, membership: managerMembership, authUser })) {
                return res.status(403).json({
                    success: false,
                    message: "Only owners or admins can grant owner role",
                });
            }

            if (requestedRole) {
                member.role = requestedRole;
            }
            if (nextStatus) {
                member.status = nextStatus;
            }
            member.updated_at = now;
            await member.save();

            if (nextStatus === "removed") {
                await refreshCircleStats(circle.id);
            }

            return res.json({
                success: true,
                circle: serializeCircle(circle, managerMembership),
                member: serializeCircleMember(member),
            });
        } catch (error) {
            console.error("Error updating stream circle member:", error);
            return res.status(500).json({ success: false, message: "Failed to update member" });
        }
    });

    // DELETE /circles/:identifier/members/:userId
    router.delete("/circles/:identifier/members/:userId", ...requireFollowWrite, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const targetUserId = String(req.params.userId || "");
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const managerMembership = await getActiveMembership(circle.id, authUser?.id);
            if (!canManageCircle({ circle, membership: managerMembership, authUser })) {
                return res.status(403).json({ success: false, message: "You do not have permission to remove members" });
            }

            const member = await StreamCircleMember.findOne({
                circle_id: String(circle.id),
                user_id: targetUserId,
                status: "active",
            });
            if (!member) {
                return res.json({ success: true, removed: false, message: "Member already removed" });
            }
            if (String(member.role || "") === "owner") {
                return res.status(400).json({ success: false, message: "Owner cannot be removed from the circle" });
            }

            member.status = "removed";
            member.updated_at = toIsoNow();
            await member.save();
            await refreshCircleStats(circle.id);

            return res.json({
                success: true,
                removed: true,
                member: serializeCircleMember(member),
            });
        } catch (error) {
            console.error("Error removing stream circle member:", error);
            return res.status(500).json({ success: false, message: "Failed to remove member" });
        }
    });

    // GET /circles/:identifier/posts
    router.get("/circles/:identifier/posts", ...requireFeedRead, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const authUserId = String(authUser?.id || "");
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const membership = await getActiveMembership(circle.id, authUserId);
            if (!canAccessCircle({ circle, membership, authUser })) {
                return res.status(403).json({ success: false, message: "You do not have access to this circle" });
            }

            const limitRaw = Number.parseInt(String(req.query.limit || "30"), 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 30;
            const before = req.query.before ? String(req.query.before) : null;

            const query = {
                status: "published",
                "metadata.circle_id": String(circle.id),
            };
            if (before) query.created_at = { $lt: before };

            const posts = await StreamPost.find(query).sort({ created_at: -1 }).limit(limit);
            const targetIds = posts.map((post) => String(post.id || ""));
            const [viewerReactionMap, viewerBookmarkSet, viewerRestreamSet] = await Promise.all([
                buildViewerReactionMap({ userId: authUserId, targetType: "post", targetIds }),
                buildViewerBookmarkSet({ userId: authUserId, postIds: targetIds }),
                buildViewerRestreamSet({ userId: authUserId, postIds: targetIds }),
            ]);

            const serialized = posts.map((post) =>
                serializePost(post, {
                    viewerReaction: viewerReactionMap.get(String(post.id || "")),
                    viewerBookmark: viewerBookmarkSet.has(String(post.id || "")),
                    viewerRestream: viewerRestreamSet.has(String(post.id || "")),
                })
            );

            const nextCursor =
                serialized.length === limit && serialized.length > 0
                    ? serialized[serialized.length - 1].created_at
                    : null;

            return res.json({
                success: true,
                circle: serializeCircle(circle, membership),
                posts: serialized,
                next_cursor: nextCursor,
                has_more: Boolean(nextCursor),
            });
        } catch (error) {
            console.error("Error listing stream circle posts:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch circle posts" });
        }
    });

    // GET /admin/circles
    router.get("/admin/circles", ...requireStreamModerate, async (req, res) => {
        try {
            const limitRaw = Number.parseInt(String(req.query.limit || "80"), 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 80;

            const circles = await StreamCircle.find({}).sort({ updated_at: -1 }).limit(limit);
            const circleIds = circles.map((circle) => String(circle.id || "")).filter(Boolean);

            const [memberCounts, postStats] = await Promise.all([
                StreamCircleMember.aggregate([
                    { $match: { circle_id: { $in: circleIds }, status: "active" } },
                    { $group: { _id: "$circle_id", member_count: { $sum: 1 } } },
                ]),
                StreamPost.aggregate([
                    {
                        $match: {
                            "metadata.circle_id": { $in: circleIds },
                        },
                    },
                    {
                        $group: {
                            _id: "$metadata.circle_id",
                            post_count: { $sum: 1 },
                            published_post_count: {
                                $sum: {
                                    $cond: [{ $eq: ["$status", "published"] }, 1, 0],
                                },
                            },
                            pending_reports: {
                                $sum: { $ifNull: ["$metadata.report_count", 0] },
                            },
                        },
                    },
                ]),
            ]);

            const memberCountMap = new Map(memberCounts.map((entry) => [String(entry._id || ""), Number(entry.member_count || 0)]));
            const postStatMap = new Map(postStats.map((entry) => [String(entry._id || ""), entry]));

            const payload = circles.map((circle) => {
                const id = String(circle.id || "");
                const stat = postStatMap.get(id);
                const metadata = circle.metadata && typeof circle.metadata === "object" ? circle.metadata : {};
                return {
                    ...serializeCircle(circle, null),
                    member_count: Number(memberCountMap.get(id) ?? circle.member_count ?? 0),
                    post_count: Number(stat?.post_count ?? circle.post_count ?? 0),
                    published_post_count: Number(stat?.published_post_count || 0),
                    pending_reports: Number(stat?.pending_reports || 0),
                    is_featured: Boolean(metadata.is_featured || metadata.featured),
                    editorial_boost: Number(metadata.editorial_boost || 0),
                };
            });

            return res.json({
                success: true,
                circles: payload,
                count: payload.length,
            });
        } catch (error) {
            console.error("Error listing admin stream circles:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch admin circles" });
        }
    });

    // PATCH /admin/circles/:identifier/feature
    router.patch("/admin/circles/:identifier/feature", ...requireStreamFeature, async (req, res) => {
        try {
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const featured = Boolean(req.body?.featured);
            const editorialBoostRaw = req.body?.editorial_boost ?? req.body?.editorialBoost;
            const editorialBoost = Number.isFinite(Number(editorialBoostRaw))
                ? Math.max(0, Math.min(10, Number(editorialBoostRaw)))
                : 0;
            const metadata = circle.metadata && typeof circle.metadata === "object" ? { ...circle.metadata } : {};
            metadata.is_featured = featured;
            metadata.featured = featured;
            metadata.editorial_boost = featured ? editorialBoost : 0;
            metadata.featured_updated_at = toIsoNow();
            circle.metadata = metadata;
            circle.updated_at = toIsoNow();
            await circle.save();

            return res.json({
                success: true,
                circle: serializeCircle(circle, null),
            });
        } catch (error) {
            console.error("Error updating stream circle feature state:", error);
            return res.status(500).json({ success: false, message: "Failed to update circle feature state" });
        }
    });
}

module.exports = mountCircleRoutes;
