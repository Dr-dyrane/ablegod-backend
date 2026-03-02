const {
    StreamPost,
    serializePost,
    buildViewerReactionMap,
    buildViewerBookmarkSet,
    buildViewerRestreamSet,
    resolveCircleByIdentifier,
    getActiveMembership,
    canAccessCircle,
    serializeCircle,
} = require("./shared");

function mountCirclePostRoutes(router, { requireFeedRead }) {
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
}

module.exports = mountCirclePostRoutes;
