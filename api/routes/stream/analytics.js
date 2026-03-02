const { StreamPost, StreamReply, StreamFollow } = require("./_helpers");
const MediaAsset = require("../../models/mediaAsset");

const DAY_MS = 24 * 60 * 60 * 1000;

function clampWindowDays(value) {
    const parsed = Number.parseInt(String(value || "30"), 10);
    if (!Number.isFinite(parsed)) return 30;
    return Math.min(Math.max(parsed, 7), 180);
}

function getCapabilities(req) {
    const payloadCaps = Array.isArray(req.auth?.payload?.capabilities) ? req.auth.payload.capabilities : [];
    const userCaps = Array.isArray(req.auth?.user?.capabilities) ? req.auth.user.capabilities : [];
    return new Set([...payloadCaps, ...userCaps].filter(Boolean));
}

function normalizeIsoDay(input) {
    const text = String(input || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function buildWindowDays(windowDays) {
    const days = [];
    const now = new Date();
    for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
        const date = new Date(now.getTime() - offset * DAY_MS);
        const day = date.toISOString().slice(0, 10);
        days.push(day);
    }
    return days;
}

function safeNumber(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function computeEngagementScore(post) {
    return (
        safeNumber(post.like_count) * 1 +
        safeNumber(post.reply_count) * 2 +
        safeNumber(post.share_count) * 3 +
        safeNumber(post.bookmark_count) * 2 +
        safeNumber(post.restream_count) * 3 +
        safeNumber(post.view_count) * 0.15
    );
}

function mountAnalyticsRoutes(router, { requirePostCreate }) {
    router.get("/analytics/creator", ...requirePostCreate, async (req, res) => {
        try {
            const authUser = req.auth?.user;
            const authUserId = String(authUser?.id || "");
            if (!authUserId) {
                return res.status(401).json({ success: false, message: "Authentication required" });
            }

            const capabilities = getCapabilities(req);
            const canReadAdminAnalytics =
                String(authUser?.role || "") === "admin" || capabilities.has("analytics:read:admin");

            const requestedUserId = String(req.query.user_id || "").trim();
            const scopeUserId = requestedUserId || authUserId;

            if (scopeUserId !== authUserId && !canReadAdminAnalytics) {
                return res.status(403).json({ success: false, message: "Insufficient permissions" });
            }

            const windowDays = clampWindowDays(req.query.window_days);
            const now = new Date();
            const since = new Date(now.getTime() - windowDays * DAY_MS);
            const sinceIso = since.toISOString();

            const [
                posts,
                aggregateTotals,
                authoredRepliesCount,
                authoredRepliesWindowCount,
                followersCount,
                followingCount,
                postsWindowCount,
                mediaAggregate,
                postDaily,
                replyDaily,
            ] = await Promise.all([
                StreamPost.find({
                    author_user_id: scopeUserId,
                    status: { $ne: "draft" },
                })
                    .sort({ created_at: -1 })
                    .limit(300),
                StreamPost.aggregate([
                    {
                        $match: {
                            author_user_id: scopeUserId,
                            status: { $ne: "draft" },
                        },
                    },
                    {
                        $group: {
                            _id: null,
                            total_posts: { $sum: 1 },
                            total_views: { $sum: { $ifNull: ["$view_count", 0] } },
                            total_replies_received: { $sum: { $ifNull: ["$reply_count", 0] } },
                            total_reactions_received: { $sum: { $ifNull: ["$like_count", 0] } },
                            total_shares_received: { $sum: { $ifNull: ["$share_count", 0] } },
                            total_bookmarks_received: { $sum: { $ifNull: ["$bookmark_count", 0] } },
                            total_restreams_received: { $sum: { $ifNull: ["$restream_count", 0] } },
                        },
                    },
                ]),
                StreamReply.countDocuments({
                    author_user_id: scopeUserId,
                    status: { $ne: "draft" },
                }),
                StreamReply.countDocuments({
                    author_user_id: scopeUserId,
                    status: { $ne: "draft" },
                    created_at: { $gte: sinceIso },
                }),
                StreamFollow.countDocuments({
                    followed_user_id: scopeUserId,
                    status: "active",
                }),
                StreamFollow.countDocuments({
                    follower_user_id: scopeUserId,
                    status: "active",
                }),
                StreamPost.countDocuments({
                    author_user_id: scopeUserId,
                    status: { $ne: "draft" },
                    created_at: { $gte: sinceIso },
                }),
                MediaAsset.aggregate([
                    {
                        $match: {
                            owner_user_id: scopeUserId,
                            status: { $ne: "deleted" },
                        },
                    },
                    {
                        $group: {
                            _id: null,
                            total_assets: { $sum: 1 },
                            image_assets: {
                                $sum: {
                                    $cond: [{ $eq: ["$resource_type", "image"] }, 1, 0],
                                },
                            },
                            video_assets: {
                                $sum: {
                                    $cond: [{ $eq: ["$resource_type", "video"] }, 1, 0],
                                },
                            },
                            total_bytes: { $sum: { $ifNull: ["$bytes", 0] } },
                            total_video_seconds: { $sum: { $ifNull: ["$duration", 0] } },
                        },
                    },
                ]),
                StreamPost.aggregate([
                    {
                        $match: {
                            author_user_id: scopeUserId,
                            status: { $ne: "draft" },
                            created_at: { $gte: sinceIso },
                        },
                    },
                    {
                        $group: {
                            _id: { $substr: ["$created_at", 0, 10] },
                            count: { $sum: 1 },
                        },
                    },
                ]),
                StreamReply.aggregate([
                    {
                        $match: {
                            author_user_id: scopeUserId,
                            status: { $ne: "draft" },
                            created_at: { $gte: sinceIso },
                        },
                    },
                    {
                        $group: {
                            _id: { $substr: ["$created_at", 0, 10] },
                            count: { $sum: 1 },
                        },
                    },
                ]),
            ]);

            const totalRollup = aggregateTotals[0] || {};
            const mediaRollup = mediaAggregate[0] || {};

            const postsWithScore = posts.map((post) => ({
                post,
                score: computeEngagementScore(post),
            }));

            const topPosts = postsWithScore
                .slice()
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map(({ post, score }) => ({
                    id: String(post.id || ""),
                    title: String(post.title || ""),
                    excerpt: String(post.excerpt || ""),
                    created_at: post.created_at,
                    intent: String(post.intent || "Reflection"),
                    view_count: safeNumber(post.view_count),
                    like_count: safeNumber(post.like_count),
                    reply_count: safeNumber(post.reply_count),
                    share_count: safeNumber(post.share_count),
                    bookmark_count: safeNumber(post.bookmark_count),
                    restream_count: safeNumber(post.restream_count),
                    engagement_score: Math.round(score * 100) / 100,
                }));

            const days = buildWindowDays(windowDays);
            const postDailyMap = new Map(
                postDaily
                    .map((entry) => [normalizeIsoDay(entry?._id), safeNumber(entry?.count)])
                    .filter((entry) => entry[0])
            );
            const replyDailyMap = new Map(
                replyDaily
                    .map((entry) => [normalizeIsoDay(entry?._id), safeNumber(entry?.count)])
                    .filter((entry) => entry[0])
            );

            const activityByDay = days.map((day) => {
                const postCount = safeNumber(postDailyMap.get(day));
                const replyCount = safeNumber(replyDailyMap.get(day));
                return {
                    day,
                    posts: postCount,
                    replies: replyCount,
                    activity: postCount + replyCount,
                };
            });

            const activeDays = activityByDay.filter((day) => day.activity > 0).length;
            const averageDailyActivity =
                windowDays > 0
                    ? Math.round(
                        (activityByDay.reduce((sum, day) => sum + day.activity, 0) / windowDays) *
                            100
                    ) / 100
                    : 0;

            return res.json({
                success: true,
                analytics: {
                    scope_user_id: scopeUserId,
                    generated_at: now.toISOString(),
                    window_days: windowDays,
                    audience: {
                        followers: safeNumber(followersCount),
                        following: safeNumber(followingCount),
                    },
                    totals: {
                        posts: safeNumber(totalRollup.total_posts),
                        replies_authored: safeNumber(authoredRepliesCount),
                        replies_received: safeNumber(totalRollup.total_replies_received),
                        reactions_received: safeNumber(totalRollup.total_reactions_received),
                        shares_received: safeNumber(totalRollup.total_shares_received),
                        bookmarks_received: safeNumber(totalRollup.total_bookmarks_received),
                        restreams_received: safeNumber(totalRollup.total_restreams_received),
                        views_received: safeNumber(totalRollup.total_views),
                    },
                    recent: {
                        posts_published: safeNumber(postsWindowCount),
                        replies_authored: safeNumber(authoredRepliesWindowCount),
                        active_days: activeDays,
                        average_daily_activity: averageDailyActivity,
                    },
                    media: {
                        total_assets: safeNumber(mediaRollup.total_assets),
                        image_assets: safeNumber(mediaRollup.image_assets),
                        video_assets: safeNumber(mediaRollup.video_assets),
                        total_bytes: safeNumber(mediaRollup.total_bytes),
                        total_video_seconds: safeNumber(mediaRollup.total_video_seconds),
                    },
                    top_posts: topPosts,
                    activity_by_day: activityByDay,
                },
            });
        } catch (error) {
            console.error("Error loading creator analytics:", error);
            return res.status(500).json({ success: false, message: "Failed to load creator analytics" });
        }
    });
}

module.exports = mountAnalyticsRoutes;
