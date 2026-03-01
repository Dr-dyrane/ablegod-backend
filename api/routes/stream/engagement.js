const { v4: uuidv4 } = require("uuid");
const {
    StreamPost, StreamReply, StreamBookmark, StreamRestream,
} = require("./_helpers");

function mountEngagementRoutes(router, { requirePostInteract, requireFeedRead }) {

    // ─── Post-level engagement ───

    router.post("/posts/:id/bookmark", ...requirePostInteract, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const postId = String(req.params.id || "");
            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });

            const existing = await StreamBookmark.findOne({ post_id: postId, user_id: String(authUser.id) });
            let isBookmarked = false;
            if (existing) {
                await existing.deleteOne();
                post.bookmark_count = Math.max(0, (post.bookmark_count || 0) - 1);
            } else {
                await new StreamBookmark({ id: uuidv4(), post_id: postId, user_id: String(authUser.id) }).save();
                post.bookmark_count = (post.bookmark_count || 0) + 1;
                isBookmarked = true;
            }
            await post.save();
            return res.json({ success: true, is_bookmarked: isBookmarked, count: post.bookmark_count });
        } catch (error) {
            console.error("Error bookmarking post:", error);
            return res.status(500).json({ success: false, message: "Failed to update bookmark" });
        }
    });

    router.post("/posts/:id/restream", ...requirePostInteract, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const postId = String(req.params.id || "");
            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });

            const existing = await StreamRestream.findOne({ post_id: postId, user_id: String(authUser.id) });
            let isRestreamed = false;
            if (existing) {
                await existing.deleteOne();
                post.restream_count = Math.max(0, (post.restream_count || 0) - 1);
            } else {
                await new StreamRestream({ id: uuidv4(), post_id: postId, user_id: String(authUser.id) }).save();
                post.restream_count = (post.restream_count || 0) + 1;
                isRestreamed = true;
            }
            await post.save();
            return res.json({ success: true, is_restreamed: isRestreamed, count: post.restream_count });
        } catch (error) {
            console.error("Error restreaming post:", error);
            return res.status(500).json({ success: false, message: "Failed to update restream" });
        }
    });

    router.post("/posts/:id/share", ...requirePostInteract, async (req, res) => {
        try {
            const postId = String(req.params.id || "");
            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });
            post.share_count = (post.share_count || 0) + 1;
            await post.save();
            return res.json({ success: true, count: post.share_count });
        } catch (error) {
            console.error("Error sharing post:", error);
            return res.status(500).json({ success: false, message: "Failed to update share count" });
        }
    });

    router.post("/posts/:id/view", ...requireFeedRead, async (req, res) => {
        try {
            const postId = String(req.params.id || "");
            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });
            post.view_count = (post.view_count || 0) + 1;
            await post.save();
            return res.json({ success: true, count: post.view_count });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Failed to update view count" });
        }
    });

    // ─── Reply-level engagement ───

    router.post("/posts/:postId/replies/:replyId/bookmark", ...requirePostInteract, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const { postId, replyId } = req.params;
            const reply = await StreamReply.findOne({ id: replyId, post_id: postId });
            if (!reply) return res.status(404).json({ success: false, message: "Stream reply not found" });

            const existing = await StreamBookmark.findOne({ post_id: postId, reply_id: replyId, user_id: String(authUser.id) });
            let isBookmarked = false;
            if (existing) {
                await existing.deleteOne();
                reply.bookmark_count = Math.max(0, (reply.bookmark_count || 0) - 1);
            } else {
                await new StreamBookmark({ id: uuidv4(), post_id: postId, reply_id: replyId, user_id: String(authUser.id) }).save();
                reply.bookmark_count = (reply.bookmark_count || 0) + 1;
                isBookmarked = true;
            }
            await reply.save();
            return res.json({ success: true, is_bookmarked: isBookmarked, count: reply.bookmark_count });
        } catch (error) {
            console.error("Error bookmarking reply:", error);
            return res.status(500).json({ success: false, message: "Failed to update bookmark" });
        }
    });

    router.post("/posts/:postId/replies/:replyId/restream", ...requirePostInteract, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const { postId, replyId } = req.params;
            const reply = await StreamReply.findOne({ id: replyId, post_id: postId });
            if (!reply) return res.status(404).json({ success: false, message: "Stream reply not found" });

            const existing = await StreamRestream.findOne({ post_id: postId, reply_id: replyId, user_id: String(authUser.id) });
            let isRestreamed = false;
            if (existing) {
                await existing.deleteOne();
                reply.restream_count = Math.max(0, (reply.restream_count || 0) - 1);
            } else {
                await new StreamRestream({ id: uuidv4(), post_id: postId, reply_id: replyId, user_id: String(authUser.id) }).save();
                reply.restream_count = (reply.restream_count || 0) + 1;
                isRestreamed = true;
            }
            await reply.save();
            return res.json({ success: true, is_restreamed: isRestreamed, count: reply.restream_count });
        } catch (error) {
            console.error("Error restreaming reply:", error);
            return res.status(500).json({ success: false, message: "Failed to update restream" });
        }
    });

    router.post("/posts/:postId/replies/:replyId/share", ...requirePostInteract, async (req, res) => {
        try {
            const { postId, replyId } = req.params;
            const reply = await StreamReply.findOne({ id: replyId, post_id: postId });
            if (!reply) return res.status(404).json({ success: false, message: "Stream reply not found" });
            reply.share_count = (reply.share_count || 0) + 1;
            await reply.save();
            return res.json({ success: true, count: reply.share_count });
        } catch (error) {
            console.error("Error sharing reply:", error);
            return res.status(500).json({ success: false, message: "Failed to update share count" });
        }
    });

    router.post("/posts/:postId/replies/:replyId/view", ...requireFeedRead, async (req, res) => {
        try {
            const { postId, replyId } = req.params;
            const reply = await StreamReply.findOne({ id: replyId, post_id: postId });
            if (!reply) return res.status(404).json({ success: false, message: "Stream reply not found" });
            reply.view_count = (reply.view_count || 0) + 1;
            await reply.save();
            return res.json({ success: true, count: reply.view_count });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Failed to update view count" });
        }
    });
}

module.exports = mountEngagementRoutes;
