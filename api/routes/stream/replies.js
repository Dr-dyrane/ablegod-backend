const { v4: uuidv4 } = require("uuid");
const {
    StreamPost, StreamReply, Notification,
    serializePost, serializeReply,
    buildViewerReactionMap, getAuthDisplayName,
} = require("./_helpers");

function mountReplyRoutes(router, { requireFeedRead, requirePostInteract, emitNotificationEvent }) {

    // ─── GET /posts/:id/replies ───
    router.get("/posts/:id/replies", ...requireFeedRead, async (req, res) => {
        try {
            const postId = String(req.params.id || "");
            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });

            const replies = await StreamReply.find({ post_id: postId, status: "published" }).sort({ created_at: 1 });
            const viewerReplyReactionMap = await buildViewerReactionMap({
                userId: req.auth?.user?.id, targetType: "reply",
                targetIds: replies.map((reply) => reply.id),
            });
            const viewerPostReactionMap = await buildViewerReactionMap({
                userId: req.auth?.user?.id, targetType: "post", targetIds: [post.id],
            });

            return res.json({
                success: true,
                post: serializePost(post, { viewerReaction: viewerPostReactionMap.get(String(post.id)) }),
                replies: replies.map((reply) =>
                    serializeReply(reply, { viewerReaction: viewerReplyReactionMap.get(String(reply.id)) })
                ),
            });
        } catch (error) {
            console.error("Error fetching stream replies:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch replies" });
        }
    });

    // ─── POST /posts/:id/replies — Create reply ───
    router.post("/posts/:id/replies", ...requirePostInteract, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const postId = String(req.params.id || "");
            const { content = "", parent_reply_id = null, metadata = {} } = req.body || {};
            const normalizedContent = String(content || "").trim();
            if (!normalizedContent) return res.status(400).json({ success: false, message: "content is required" });

            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });

            const now = new Date().toISOString();
            const reply = new StreamReply({
                id: uuidv4(), post_id: postId,
                parent_reply_id: parent_reply_id ? String(parent_reply_id) : null,
                author_user_id: String(authUser.id),
                author_name: getAuthDisplayName(authUser, "User"),
                author_role: String(authUser.role || "user"),
                content: normalizedContent, status: "published", metadata,
                created_at: now, updated_at: now,
            });

            await reply.save();
            post.reply_count = Number(post.reply_count || 0) + 1;
            post.updated_at = now;
            await post.save();

            const postAuthorId = String(post.author_user_id || "");
            if (postAuthorId && postAuthorId !== String(authUser.id)) {
                const notification = new Notification({
                    id: uuidv4(), user_id: postAuthorId, type: "comment",
                    message: `${reply.author_name} replied to your stream post`,
                    post_id: null, post_title: post.title || post.excerpt || "Stream post",
                    metadata: {
                        kind: "stream_reply", stream_post_id: post.id, reply_id: reply.id,
                        actor_user_id: String(authUser.id), actor_name: reply.author_name,
                    },
                    is_read: false, created_at: now, read_at: null,
                });
                const saved = await notification.save();
                emitNotificationEvent(saved);
            }

            return res.status(201).json({ success: true, reply: serializeReply(reply), post: serializePost(post) });
        } catch (error) {
            console.error("Error creating stream reply:", error);
            return res.status(500).json({ success: false, message: "Failed to create reply" });
        }
    });

    // ─── PATCH /posts/:postId/replies/:replyId — Edit reply ───
    router.patch("/posts/:postId/replies/:replyId", ...requirePostInteract, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const { postId, replyId } = req.params;
            const { content, reason = "User edit" } = req.body || {};

            const reply = await StreamReply.findOne({ id: replyId, post_id: postId });
            if (!reply) return res.status(404).json({ success: false, message: "Reply not found" });
            if (String(reply.author_user_id) !== String(authUser.id) && authUser.role !== "admin") {
                return res.status(403).json({ success: false, message: "Unauthorized to edit this reply" });
            }

            if (!reply.edit_history) reply.edit_history = [];
            reply.edit_history.push({ content: reply.content, edited_at: new Date().toISOString(), reason });
            if (content !== undefined) reply.content = String(content).trim();
            reply.updated_at = new Date().toISOString();

            await reply.save();
            return res.json({ success: true, reply: serializeReply(reply) });
        } catch (error) {
            console.error("Error editing stream reply:", error);
            return res.status(500).json({ success: false, message: "Failed to edit reply" });
        }
    });
}

module.exports = mountReplyRoutes;
