const { v4: uuidv4 } = require("uuid");
const {
    StreamPost, StreamFollow, Notification, User,
    getFollowSetForUser, buildFollowSnapshot,
    getDisplayNameFromUser, getAuthDisplayName,
} = require("./_helpers");

function mountFollowRoutes(router, { requireFollowRead, requireFollowWrite, emitNotificationEvent }) {

    // ─── GET /follows/me ───
    router.get("/follows/me", ...requireFollowRead, async (req, res) => {
        try {
            const authUserId = String(req.auth?.user?.id || "");
            const snapshot = await buildFollowSnapshot(authUserId);
            return res.json({
                success: true, user_id: authUserId,
                following: snapshot.following, followers: snapshot.followers,
                counts: { following: snapshot.following.length, followers: snapshot.followers.length },
            });
        } catch (error) {
            console.error("Error fetching follow snapshot:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch follows" });
        }
    });

    // ─── GET /suggestions ───
    router.get("/suggestions", ...requireFollowRead, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const authUserId = String(authUser.id || "");
            const limitRaw = Number.parseInt(String(req.query.limit || "8"), 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 8;
            const search = String(req.query.q || "").trim().toLowerCase();

            const followingSet = await getFollowSetForUser(authUserId);
            const users = await User.find({ status: { $ne: "inactive" } }).limit(200);

            const suggestions = users
                .filter((user) => {
                    const userId = String(user.id || "");
                    if (!userId || userId === authUserId) return false;
                    if (followingSet.has(userId)) return false;
                    if (search) {
                        const haystack = [
                            String(user.username || ""), String(user.email || ""),
                            String(user.first_name || ""), String(user.last_name || ""),
                        ].join(" ").toLowerCase();
                        if (!haystack.includes(search)) return false;
                    }
                    return true;
                })
                .slice(0, limit);

            const suggestionIds = suggestions.map((user) => String(user.id || ""));
            const [postCounts, followerCounts] = await Promise.all([
                StreamPost.aggregate([
                    { $match: { author_user_id: { $in: suggestionIds }, status: "published" } },
                    { $group: { _id: "$author_user_id", post_count: { $sum: 1 } } },
                ]),
                StreamFollow.aggregate([
                    { $match: { followed_user_id: { $in: suggestionIds }, status: "active" } },
                    { $group: { _id: "$followed_user_id", follower_count: { $sum: 1 } } },
                ]),
            ]);
            const postCountMap = new Map(postCounts.map((row) => [String(row._id), Number(row.post_count || 0)]));
            const followerCountMap = new Map(followerCounts.map((row) => [String(row._id), Number(row.follower_count || 0)]));

            return res.json({
                success: true,
                suggestions: suggestions.map((user) => ({
                    id: String(user.id || ""), username: String(user.username || ""),
                    name: getDisplayNameFromUser(user), role: String(user.role || "user"),
                    avatar_url: String(user.avatar_url || ""),
                    post_count: Number(postCountMap.get(String(user.id || "")) || 0),
                    follower_count: Number(followerCountMap.get(String(user.id || "")) || 0),
                })),
            });
        } catch (error) {
            console.error("Error fetching follow suggestions:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch suggestions" });
        }
    });

    // ─── PUT /follows/:userId — Toggle follow ───
    router.put("/follows/:userId", ...requireFollowWrite, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const followerUserId = String(authUser.id || "");
            const followedUserId = String(req.params.userId || "");
            const follow = req.body?.follow !== false;

            if (!followedUserId || followedUserId === followerUserId) {
                return res.status(400).json({ success: false, message: "Invalid follow target" });
            }

            const targetUser = await User.findOne({ id: followedUserId });
            if (!targetUser) return res.status(404).json({ success: false, message: "User not found" });

            let existing = await StreamFollow.findOne({
                follower_user_id: followerUserId, followed_user_id: followedUserId,
            });

            let isFollowing = false;
            const now = new Date().toISOString();

            if (!follow) {
                if (existing) await existing.deleteOne();
            } else if (!existing) {
                existing = await new StreamFollow({
                    id: uuidv4(), follower_user_id: followerUserId, followed_user_id: followedUserId,
                    follower_name: getDisplayNameFromUser(authUser),
                    followed_name: getDisplayNameFromUser(targetUser),
                    status: "active", created_at: now, updated_at: now,
                }).save();
                isFollowing = true;
                if (String(targetUser.id) !== followerUserId) {
                    const notification = await new Notification({
                        id: uuidv4(), user_id: String(targetUser.id), type: "system",
                        message: `${getDisplayNameFromUser(authUser)} followed you`,
                        post_id: null, post_title: "",
                        metadata: {
                            kind: "stream_follow", actor_user_id: followerUserId,
                            actor_name: getDisplayNameFromUser(authUser),
                        },
                        is_read: false, created_at: now, read_at: null,
                    }).save();
                    emitNotificationEvent(notification);
                }
            } else {
                existing.status = "active";
                existing.updated_at = now;
                existing.follower_name = getDisplayNameFromUser(authUser);
                existing.followed_name = getDisplayNameFromUser(targetUser);
                await existing.save();
                isFollowing = true;
            }

            if (!isFollowing) {
                isFollowing = Boolean(
                    await StreamFollow.findOne({
                        follower_user_id: followerUserId, followed_user_id: followedUserId, status: "active",
                    })
                );
            }

            const [followersCount, followingCount] = await Promise.all([
                StreamFollow.countDocuments({ followed_user_id: followedUserId, status: "active" }),
                StreamFollow.countDocuments({ follower_user_id: followerUserId, status: "active" }),
            ]);

            return res.json({
                success: true, following: isFollowing,
                target: { user_id: followedUserId, name: getDisplayNameFromUser(targetUser) },
                counts: { target_followers: followersCount, viewer_following: followingCount },
            });
        } catch (error) {
            console.error("Error updating follow state:", error);
            return res.status(500).json({ success: false, message: "Failed to update follow state" });
        }
    });

    // ─── GET /follows/:userId/counts ───
    router.get("/follows/:userId/counts", ...requireFollowRead, async (req, res) => {
        try {
            const userId = String(req.params.userId || "");
            const [followersCount, followingCount] = await Promise.all([
                StreamFollow.countDocuments({ followed_user_id: userId, status: "active" }),
                StreamFollow.countDocuments({ follower_user_id: userId, status: "active" }),
            ]);
            return res.json({ success: true, user_id: userId, followers: followersCount, following: followingCount });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Failed to fetch follow counts" });
        }
    });
}

module.exports = mountFollowRoutes;
