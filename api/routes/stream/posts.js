const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { requireCapabilities } = require("../../middleware/auth");
const AIService = require("../../services/aiService");
const {
    StreamPost, StreamReply, StreamReaction, StreamBookmark, StreamRestream, StreamReport, User,
    serializePost,
    buildViewerReactionMap, buildViewerBookmarkSet, buildViewerRestreamSet,
    getFollowSetForUser, sortPostsForFeed,
    getAuthDisplayName,
} = require("./_helpers");

function mountPostRoutes(router, { requireFeedRead, requirePostCreate, requirePostUpdate }) {

    // ─── GET /posts — Feed listing with cursor pagination ───
    router.get("/posts", ...requireFeedRead, async (req, res) => {
        try {
            const limitRaw = Number.parseInt(String(req.query.limit || "30"), 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 30;
            const status = String(req.query.status || "published");
            const feed = String(req.query.feed || "following").toLowerCase();
            const before = req.query.before ? String(req.query.before) : null; // cursor

            const query = status === "all" ? {} : { status };
            // search parameters
            const q = req.query.q ? String(req.query.q).trim() : null;
            const tag = req.query.tag ? String(req.query.tag).trim().toLowerCase() : null;
            if (q) {
                query.$text = { $search: q };
            }
            if (tag) {
                query["metadata.tags"] = tag;
            }
            if (before) {
                query.created_at = { $lt: before };
            }
            const candidateLimit = feed === "explore" ? Math.min(limit * 3, 200) : limit;
            let posts;
            if (query.$text) {
                posts = await StreamPost.find(query, { score: { $meta: "textScore" } })
                    .sort({ score: { $meta: "textScore" }, created_at: -1 })
                    .limit(candidateLimit);
            } else {
                posts = await StreamPost.find(query).sort({ created_at: -1 }).limit(candidateLimit);
            }
            const authUserId = req.auth?.user?.id;
            const feedContext = {};
            if (feed === "following") {
                const followingSet = await getFollowSetForUser(authUserId);
                const allowedIds = new Set([String(authUserId || ""), ...followingSet]);
                const filtered = posts.filter((post) => allowedIds.has(String(post.author_user_id || "")));
                if (filtered.length > 0) {
                    posts = filtered;
                    feedContext.mode = "follow-graph";
                    feedContext.followingCount = followingSet.size;
                } else {
                    feedContext.mode = "fallback";
                    feedContext.followingCount = followingSet.size;
                }
            } else if (feed === "bookmarks" && authUserId) {
                const bookmarkQuery = { user_id: String(authUserId) };
                if (before) bookmarkQuery.created_at = { $lt: before };
                const bookmarks = await StreamBookmark.find(bookmarkQuery).sort({ created_at: -1 });
                const bookmarkPostIds = bookmarks.map(b => String(b.post_id));
                const statusQuery = status === "all" ? {} : { status };
                posts = await StreamPost.find({ id: { $in: bookmarkPostIds }, ...statusQuery });
                const postMap = new Map(posts.map(p => [String(p.id), p]));
                posts = bookmarkPostIds.map(id => postMap.get(id)).filter(Boolean);
            }

            const sortedPosts = feed === "bookmarks" ? posts.slice(0, limit) : sortPostsForFeed(posts, feed, authUserId).slice(0, limit);

            const targetIds = sortedPosts.map((post) => post.id);

            const [viewerReactionMap, viewerBookmarkSet, viewerRestreamSet] = await Promise.all([
                buildViewerReactionMap({ userId: authUserId, targetType: "post", targetIds }),
                buildViewerBookmarkSet({ userId: authUserId, postIds: targetIds }),
                buildViewerRestreamSet({ userId: authUserId, postIds: targetIds })
            ]);

            const serialized = sortedPosts.map((post) =>
                serializePost(post, {
                    viewerReaction: viewerReactionMap.get(String(post.id)),
                    viewerBookmark: viewerBookmarkSet.has(String(post.id)),
                    viewerRestream: viewerRestreamSet.has(String(post.id)),
                })
            );

            const nextCursor = serialized.length === limit && serialized.length > 0
                ? serialized[serialized.length - 1].created_at
                : null;

            return res.json({
                success: true,
                feed,
                feed_context: feedContext,
                posts: serialized,
                next_cursor: nextCursor,
                has_more: nextCursor !== null,
            });
        } catch (error) {
            console.error("Error listing stream posts:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch stream posts" });
        }
    });

    // ─── GET /posts/tags/trending — simple trending tags computation ───
    router.get("/posts/tags/trending", ...requireFeedRead, async (req, res) => {
        try {
            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const tagsAgg = await StreamPost.aggregate([
                { $match: { status: "published", created_at: { $gte: since }, "metadata.tags": { $exists: true, $ne: [] } } },
                { $unwind: "$metadata.tags" },
                { $group: { _id: { $toLower: "$metadata.tags" }, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 20 }
            ]);
            let tags = tagsAgg.map((t) => t._id);
            // optionally vet tags with AI moderation (fail-open)
            if (AIService && AIService.moderateContent) {
                const vetted = [];
                for (const tag of tags) {
                    try {
                        const mod = await AIService.moderateContent(tag, {});
                        if (mod.is_worthy) vetted.push(tag);
                    } catch (e) {
                        vetted.push(tag);
                    }
                }
                tags = vetted;
            }
            return res.json({ success: true, tags });
        } catch (err) {
            console.error("Trending tags error", err);
            return res.status(500).json({ success: false, message: "Failed to compute trending tags" });
        }
    });

    // ─── POST /posts — Create post (with AI moderation) ───
    router.post("/posts", ...requirePostCreate, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const {
                title = "", content = "", excerpt = "",
                intent = "Reflection", image_url, imageUrl,
                status = "published", metadata = {},
            } = req.body || {};

            const normalizedContent = String(content || "").trim();
            if (!normalizedContent) {
                return res.status(400).json({ success: false, message: "content is required" });
            }

            // AI SPIRITUAL MODERATION
            try {
                const userRecord = await User.findOne({ id: authUser.id });
                let aiSettings = userRecord?.ai_settings || {};
                if (!aiSettings.openai_key && !aiSettings.anthropic_key) {
                    const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
                    if (admin?.ai_settings) aiSettings = admin.ai_settings;
                }
                if (aiSettings.openai_key || aiSettings.anthropic_key) {
                    const moderation = await AIService.moderateContent(normalizedContent, aiSettings);
                    if (moderation && !moderation.is_worthy) {
                        return res.status(400).json({
                            success: false,
                            code: "AI_SPIRITUAL_WARNING",
                            message: moderation.reason || "We plead with you to act in ways that serve God and the community."
                        });
                    }
                }
            } catch (aiErr) {
                console.error("AI Moderation Pre-check failed:", aiErr);
            }

            const now = new Date().toISOString();
            // Look up user record for persistent author fields
            const userRecord = await User.findOne({ id: authUser.id });
            const post = new StreamPost({
                id: uuidv4(),
                author_user_id: String(authUser.id),
                author_name: getAuthDisplayName(authUser, "User"),
                author_username: String(userRecord?.username || authUser.username || authUser.email?.split("@")[0] || ""),
                author_avatar_url: String(userRecord?.avatar_url || userRecord?.avatarUrl || authUser.avatar_url || ""),
                author_role: String(authUser.role || "user"),
                intent: String(intent || "Reflection"),
                title: String(title || "").trim(),
                content: normalizedContent,
                excerpt: String(excerpt || normalizedContent.slice(0, 180)).trim(),
                image_url: String(image_url || imageUrl || "").trim(),
                status: String(status || "published"),
                reply_count: 0,
                like_count: 0,
                metadata,
                created_at: now,
                updated_at: now,
            });

            await post.save();
            return res.status(201).json({ success: true, post: serializePost(post) });
        } catch (error) {
            console.error("Error creating stream post:", error);
            return res.status(500).json({ success: false, message: "Failed to create stream post" });
        }
    });

    // ─── PATCH /posts/:id — Edit post ───
    router.patch("/posts/:id", ...requirePostUpdate, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const { id } = req.params;
            const { title, content, image_url, imageUrl, reason = "User edit" } = req.body || {};

            const post = await StreamPost.findOne({ id });
            if (!post) return res.status(404).json({ success: false, message: "Post not found" });
            if (String(post.author_user_id) !== String(authUser.id) && authUser.role !== "admin") {
                return res.status(403).json({ success: false, message: "Unauthorized to edit this post" });
            }

            if (!post.edit_history) post.edit_history = [];
            post.edit_history.push({
                content: post.content, title: post.title, image_url: post.image_url,
                edited_at: new Date().toISOString(), reason,
            });

            if (content !== undefined) post.content = String(content).trim();
            if (title !== undefined) post.title = String(title).trim();
            const finalImageUrl = String(image_url || imageUrl || "").trim();
            if (image_url !== undefined || imageUrl !== undefined) post.image_url = finalImageUrl;
            post.updated_at = new Date().toISOString();
            if (content !== undefined) post.excerpt = post.content.slice(0, 180).replace(/\s+/g, " ").trim();

            await post.save();
            return res.json({ success: true, post: serializePost(post) });
        } catch (error) {
            console.error("Error updating stream post:", error);
            return res.status(500).json({ success: false, message: "Failed to update stream post" });
        }
    });

    // ─── GET /posts/:id — Single post ───
    router.get("/posts/:id", ...requireFeedRead, async (req, res) => {
        try {
            const post = await StreamPost.findOne({ id: String(req.params.id) });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });
            const authUserId = req.auth?.user?.id;
            const targetIds = [String(post.id)];
            const [viewerReactionMap, viewerBookmarkSet, viewerRestreamSet] = await Promise.all([
                buildViewerReactionMap({ userId: authUserId, targetType: "post", targetIds }),
                buildViewerBookmarkSet({ userId: authUserId, postIds: targetIds }),
                buildViewerRestreamSet({ userId: authUserId, postIds: targetIds })
            ]);
            return res.json({
                success: true,
                post: serializePost(post, {
                    viewerReaction: viewerReactionMap.get(String(post.id)),
                    viewerBookmark: viewerBookmarkSet.has(String(post.id)),
                    viewerRestream: viewerRestreamSet.has(String(post.id))
                }),
            });
        } catch (error) {
            console.error("Error fetching stream post:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch stream post" });
        }
    });

    // ─── DELETE /posts/:id — Remove post (author or admin) ───
    router.delete("/posts/:id", ...requirePostUpdate, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const postId = String(req.params.id || "");
            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Post not found" });
            if (String(post.author_user_id) !== String(authUser.id) && authUser.role !== "admin") {
                return res.status(403).json({ success: false, message: "Unauthorized to delete this post" });
            }

            // Cascading cleanup
            const replyIds = (await StreamReply.find({ post_id: postId }, { id: 1 })).map(r => r.id);
            await Promise.all([
                StreamReply.deleteMany({ post_id: postId }),
                StreamReaction.deleteMany({ post_id: postId }),
                StreamBookmark.deleteMany({ post_id: postId }),
                StreamRestream.deleteMany({ post_id: postId }),
                StreamReport.deleteMany({ post_id: postId }),
            ]);
            await post.deleteOne();

            return res.json({
                success: true,
                message: "Post removed",
                deleted_post_id: postId,
                deleted_reply_count: replyIds.length,
            });
        } catch (error) {
            console.error("Error deleting stream post:", error);
            return res.status(500).json({ success: false, message: "Failed to delete post" });
        }
    });
}

module.exports = mountPostRoutes;
