const { v4: uuidv4 } = require("uuid");
const {
    StreamPost, StreamReply, StreamReaction,
    serializePost, serializeReply,
    normalizeReactionType, recomputeTargetReactionCounts,
    persistTargetReactionCounts, createReactionNotification,
} = require("./_helpers");

function mountReactionRoutes(router, { requirePostInteract, emitNotificationEvent }) {

    // ─── PUT /posts/:id/reaction ───
    router.put("/posts/:id/reaction", ...requirePostInteract, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const postId = String(req.params.id || "");
            const reactionType = normalizeReactionType(req.body?.reaction_type || req.body?.reaction);
            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });

            const existing = await StreamReaction.findOne({
                target_type: "post", target_id: postId, user_id: String(authUser.id),
            });

            let viewerReaction = null;
            const actorName = [String(authUser.first_name), String(authUser.last_name)]
                .filter((v) => v && v !== "undefined").join(" ").trim()
                || authUser.username || authUser.email || "User";

            if (!reactionType) {
                if (existing) await existing.deleteOne();
            } else if (!existing) {
                await new StreamReaction({
                    id: uuidv4(), target_type: "post", target_id: postId, post_id: postId,
                    reply_id: null, user_id: String(authUser.id), user_name: actorName,
                    reaction_type: reactionType,
                    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                }).save();
                viewerReaction = reactionType;
                await createReactionNotification({
                    authUser, targetAuthorUserId: post.author_user_id,
                    targetKind: "stream post", streamPost: post, reactionType, emitNotificationEvent,
                });
            } else if (String(existing.reaction_type) === reactionType) {
                await existing.deleteOne();
            } else {
                existing.reaction_type = reactionType;
                existing.updated_at = new Date().toISOString();
                await existing.save();
                viewerReaction = reactionType;
                await createReactionNotification({
                    authUser, targetAuthorUserId: post.author_user_id,
                    targetKind: "stream post", streamPost: post, reactionType, emitNotificationEvent,
                });
            }

            if (!viewerReaction) {
                const updated = await StreamReaction.findOne({
                    target_type: "post", target_id: postId, user_id: String(authUser.id),
                });
                viewerReaction = updated ? String(updated.reaction_type) : null;
            }

            const counts = await recomputeTargetReactionCounts({ targetType: "post", targetId: postId });
            await persistTargetReactionCounts({ targetType: "post", target: post, counts });

            return res.json({
                success: true, target_type: "post", target_id: postId,
                reaction_type: viewerReaction,
                reaction_counts: post.reaction_counts,
                post: serializePost(post, { viewerReaction }),
            });
        } catch (error) {
            console.error("Error reacting to stream post:", error);
            return res.status(500).json({ success: false, message: "Failed to update reaction" });
        }
    });

    // ─── PUT /posts/:postId/replies/:replyId/reaction ───
    router.put("/posts/:postId/replies/:replyId/reaction", ...requirePostInteract, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const postId = String(req.params.postId || "");
            const replyId = String(req.params.replyId || "");
            const reactionType = normalizeReactionType(req.body?.reaction_type || req.body?.reaction);
            const reply = await StreamReply.findOne({ id: replyId, post_id: postId });
            if (!reply) return res.status(404).json({ success: false, message: "Stream reply not found" });
            const post = await StreamPost.findOne({ id: postId });

            const existing = await StreamReaction.findOne({
                target_type: "reply", target_id: replyId, user_id: String(authUser.id),
            });

            let viewerReaction = null;
            const actorName = [String(authUser.first_name), String(authUser.last_name)]
                .filter((v) => v && v !== "undefined").join(" ").trim()
                || authUser.username || authUser.email || "User";

            if (!reactionType) {
                if (existing) await existing.deleteOne();
            } else if (!existing) {
                await new StreamReaction({
                    id: uuidv4(), target_type: "reply", target_id: replyId,
                    post_id: postId, reply_id: replyId, user_id: String(authUser.id),
                    user_name: actorName, reaction_type: reactionType,
                    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                }).save();
                viewerReaction = reactionType;
                await createReactionNotification({
                    authUser, targetAuthorUserId: reply.author_user_id,
                    targetKind: "reply", streamPost: post, streamReply: reply,
                    reactionType, emitNotificationEvent,
                });
            } else if (String(existing.reaction_type) === reactionType) {
                await existing.deleteOne();
            } else {
                existing.reaction_type = reactionType;
                existing.updated_at = new Date().toISOString();
                await existing.save();
                viewerReaction = reactionType;
                await createReactionNotification({
                    authUser, targetAuthorUserId: reply.author_user_id,
                    targetKind: "reply", streamPost: post, streamReply: reply,
                    reactionType, emitNotificationEvent,
                });
            }

            if (!viewerReaction) {
                const updated = await StreamReaction.findOne({
                    target_type: "reply", target_id: replyId, user_id: String(authUser.id),
                });
                viewerReaction = updated ? String(updated.reaction_type) : null;
            }

            const counts = await recomputeTargetReactionCounts({ targetType: "reply", targetId: replyId });
            await persistTargetReactionCounts({ targetType: "reply", target: reply, counts });

            return res.json({
                success: true, target_type: "reply", target_id: replyId,
                reaction_type: viewerReaction,
                reaction_counts: reply.reaction_counts,
                reply: serializeReply(reply, { viewerReaction }),
            });
        } catch (error) {
            console.error("Error reacting to stream reply:", error);
            return res.status(500).json({ success: false, message: "Failed to update reaction" });
        }
    });
}

module.exports = mountReactionRoutes;
