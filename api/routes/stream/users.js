/**
 * stream/users.js — Public user profile endpoint
 *
 * GET /stream/users/:userId/public
 *   Returns a streamer's public profile: name, username, avatar,
 *   bio, follower/following counts, post count, and the viewer's
 *   is_following state. No private fields are leaked.
 */

const {
    StreamPost, StreamFollow, User,
    getDisplayNameFromUser,
} = require("./_helpers");

function mountUsersRoutes(router, { requireFollowRead }) {
    // ─── GET /users/:userId/public ───────────────────────────────────────────
    // Public profile of any streamer. Auth required (viewers must be logged in).
    router.get("/users/:userId/public", ...requireFollowRead, async (req, res) => {
        try {
            const viewerUserId = String(req.auth?.user?.id || "");
            const targetUserId = String(req.params.userId || "").trim();

            if (!targetUserId) {
                return res.status(400).json({ success: false, message: "User ID required" });
            }

            const user = await User.findOne({ id: targetUserId });
            if (!user) {
                return res.status(404).json({ success: false, message: "Streamer not found" });
            }

            // Run all aggregates in parallel — single round-trip regardless of counts
            const [followerCount, followingCount, postCount, followRecord] = await Promise.all([
                StreamFollow.countDocuments({ followed_user_id: targetUserId, status: "active" }),
                StreamFollow.countDocuments({ follower_user_id: targetUserId, status: "active" }),
                StreamPost.countDocuments({ author_user_id: targetUserId, status: "published" }),
                viewerUserId && viewerUserId !== targetUserId
                    ? StreamFollow.findOne({
                        follower_user_id: viewerUserId,
                        followed_user_id: targetUserId,
                        status: "active",
                    })
                    : Promise.resolve(null),
            ]);

            return res.json({
                success: true,
                profile: {
                    id: String(user.id),
                    name: getDisplayNameFromUser(user),
                    username: String(user.username || ""),
                    avatar_url: String(user.avatar_url || ""),
                    bio: String(user.bio || ""),
                    role: String(user.role || "user"),
                    follower_count: Number(followerCount),
                    following_count: Number(followingCount),
                    post_count: Number(postCount),
                    // Viewer relationship
                    is_following: Boolean(followRecord),
                    is_own_profile: viewerUserId === targetUserId,
                },
            });
        } catch (error) {
            console.error("Error fetching public profile:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch profile" });
        }
    });
}

module.exports = mountUsersRoutes;
