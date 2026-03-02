const { v4: uuidv4 } = require("uuid");
const {
    StreamCircleMember,
    Notification,
    getAuthDisplayName,
    normalizeCircleRole,
    resolveCircleByIdentifier,
    getActiveMembership,
    canAccessCircle,
    canManageCircle,
    canPromoteCircleMembers,
    resolveUserByIdentifier,
    serializeCircleMember,
    serializeCircle,
    toIsoNow,
    refreshCircleStats,
} = require("./shared");

function mountCircleMemberRoutes(router, { requireFeedRead, requireFollowWrite, emitNotificationEvent }) {
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
}

module.exports = mountCircleMemberRoutes;
