const { StreamPost, StreamReply, StreamFollow, StreamReport, User } = require("./_helpers");
const MediaAsset = require("../../models/mediaAsset");

const DAY_MS = 24 * 60 * 60 * 1000;

function clampWindowDays(value) {
    const parsed = Number.parseInt(String(value || "30"), 10);
    if (!Number.isFinite(parsed)) return 30;
    return Math.min(Math.max(parsed, 7), 180);
}

function clampLimit(value, fallback = 30, max = 100) {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, 1), max);
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

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, safeNumber(value)));
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

function computeCreatorTrustScore({ openReports, blockedPosts, restrictedPosts, featuredPosts }) {
    const penalty = safeNumber(openReports) * 6 + safeNumber(blockedPosts) * 14 + safeNumber(restrictedPosts) * 8;
    const credit = safeNumber(featuredPosts) * 2;
    return clampNumber(100 - penalty + credit, 0, 100);
}

function computeCreatorGrowthScore(metrics) {
    return Math.round(
        (
            safeNumber(metrics.viewsReceived) * 0.08 +
            safeNumber(metrics.repliesReceived) * 2.2 +
            safeNumber(metrics.reactionsReceived) * 1.1 +
            safeNumber(metrics.sharesReceived) * 2.6 +
            safeNumber(metrics.bookmarksReceived) * 1.8 +
            safeNumber(metrics.restreamsReceived) * 2.8 +
            safeNumber(metrics.posts) * 3 +
            safeNumber(metrics.repliesAuthored) * 1.2 +
            safeNumber(metrics.followerCount) * 0.35 +
            safeNumber(metrics.trustScore) * 0.7
        ) *
            100
    ) / 100;
}

function mountAnalyticsRoutes(router, { requirePostCreate, requireStreamFeature }) {
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

    router.get("/admin/creators", ...requireStreamFeature, async (req, res) => {
        try {
            const windowDays = clampWindowDays(req.query.window_days);
            const limit = clampLimit(req.query.limit, 30, 100);
            const now = new Date();
            const since = new Date(now.getTime() - windowDays * DAY_MS);
            const sinceIso = since.toISOString();

            const [postRollup, replyRollup, reportRollup, followRollup] = await Promise.all([
                StreamPost.aggregate([
                    {
                        $match: {
                            status: { $ne: "draft" },
                            created_at: { $gte: sinceIso },
                            author_user_id: { $exists: true, $ne: "" },
                        },
                    },
                    {
                        $group: {
                            _id: "$author_user_id",
                            posts: { $sum: 1 },
                            views_received: { $sum: { $ifNull: ["$view_count", 0] } },
                            replies_received: { $sum: { $ifNull: ["$reply_count", 0] } },
                            reactions_received: { $sum: { $ifNull: ["$like_count", 0] } },
                            shares_received: { $sum: { $ifNull: ["$share_count", 0] } },
                            bookmarks_received: { $sum: { $ifNull: ["$bookmark_count", 0] } },
                            restreams_received: { $sum: { $ifNull: ["$restream_count", 0] } },
                            blocked_posts: {
                                $sum: {
                                    $cond: [{ $eq: ["$metadata.moderation_status", "blocked"] }, 1, 0],
                                },
                            },
                            restricted_posts: {
                                $sum: {
                                    $cond: [{ $eq: ["$metadata.moderation_status", "restricted"] }, 1, 0],
                                },
                            },
                            featured_posts: {
                                $sum: {
                                    $cond: [
                                        {
                                            $or: [
                                                { $eq: ["$metadata.is_featured", true] },
                                                { $eq: ["$metadata.featured", true] },
                                            ],
                                        },
                                        1,
                                        0,
                                    ],
                                },
                            },
                            video_posts: {
                                $sum: {
                                    $cond: [{ $eq: ["$media_type", "video"] }, 1, 0],
                                },
                            },
                        },
                    },
                ]),
                StreamReply.aggregate([
                    {
                        $match: {
                            status: { $ne: "draft" },
                            created_at: { $gte: sinceIso },
                            author_user_id: { $exists: true, $ne: "" },
                        },
                    },
                    {
                        $group: {
                            _id: "$author_user_id",
                            replies_authored: { $sum: 1 },
                        },
                    },
                ]),
                StreamReport.aggregate([
                    {
                        $match: {
                            status: { $in: ["open", "under_review"] },
                            reported_user_id: { $exists: true, $ne: "" },
                        },
                    },
                    {
                        $group: {
                            _id: "$reported_user_id",
                            open_reports: { $sum: 1 },
                        },
                    },
                ]),
                StreamFollow.aggregate([
                    {
                        $match: {
                            status: "active",
                            followed_user_id: { $exists: true, $ne: "" },
                        },
                    },
                    {
                        $group: {
                            _id: "$followed_user_id",
                            follower_count: { $sum: 1 },
                        },
                    },
                ]),
            ]);

            const postMap = new Map(
                postRollup.map((entry) => [String(entry?._id || ""), entry]).filter((entry) => entry[0])
            );
            const replyMap = new Map(
                replyRollup.map((entry) => [String(entry?._id || ""), entry]).filter((entry) => entry[0])
            );
            const reportMap = new Map(
                reportRollup.map((entry) => [String(entry?._id || ""), entry]).filter((entry) => entry[0])
            );
            const followMap = new Map(
                followRollup.map((entry) => [String(entry?._id || ""), entry]).filter((entry) => entry[0])
            );

            const userIds = Array.from(
                new Set([
                    ...Array.from(postMap.keys()),
                    ...Array.from(replyMap.keys()),
                    ...Array.from(reportMap.keys()),
                    ...Array.from(followMap.keys()),
                ])
            );
            const numericUserIds = userIds
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value));

            const users = userIds.length
                ? await User.find({
                      status: { $ne: "inactive" },
                      $or: [
                          { id: { $in: userIds } },
                          ...(numericUserIds.length > 0 ? [{ id: { $in: numericUserIds } }] : []),
                      ],
                  })
                      .select(
                          "id username first_name last_name email role status avatar_url followers_count following_count verified stream_creator_featured stream_creator_featured_updated_at"
                      )
                      .lean()
                      .maxTimeMS(6000)
                      .exec()
                : [];

            const creators = users
                .map((user) => {
                    const userId = String(user?.id || "");
                    const postMetrics = postMap.get(userId) || {};
                    const replyMetrics = replyMap.get(userId) || {};
                    const reportMetrics = reportMap.get(userId) || {};
                    const followMetrics = followMap.get(userId) || {};

                    const followerCount = Math.max(
                        safeNumber(followMetrics.follower_count),
                        safeNumber(user?.followers_count)
                    );
                    const trustScore = computeCreatorTrustScore({
                        openReports: safeNumber(reportMetrics.open_reports),
                        blockedPosts: safeNumber(postMetrics.blocked_posts),
                        restrictedPosts: safeNumber(postMetrics.restricted_posts),
                        featuredPosts: safeNumber(postMetrics.featured_posts),
                    });
                    const growthScore = computeCreatorGrowthScore({
                        viewsReceived: safeNumber(postMetrics.views_received),
                        repliesReceived: safeNumber(postMetrics.replies_received),
                        reactionsReceived: safeNumber(postMetrics.reactions_received),
                        sharesReceived: safeNumber(postMetrics.shares_received),
                        bookmarksReceived: safeNumber(postMetrics.bookmarks_received),
                        restreamsReceived: safeNumber(postMetrics.restreams_received),
                        posts: safeNumber(postMetrics.posts),
                        repliesAuthored: safeNumber(replyMetrics.replies_authored),
                        followerCount,
                        trustScore,
                    });

                    return {
                        user_id: userId,
                        username: String(user?.username || ""),
                        name:
                            [String(user?.first_name || ""), String(user?.last_name || "")]
                                .filter(Boolean)
                                .join(" ")
                                .trim() || String(user?.username || user?.email || "Member"),
                        email: String(user?.email || ""),
                        role: String(user?.role || "user"),
                        status: String(user?.status || "active"),
                        avatar_url: String(user?.avatar_url || ""),
                        followers: followerCount,
                        following: safeNumber(user?.following_count),
                        posts: safeNumber(postMetrics.posts),
                        replies_authored: safeNumber(replyMetrics.replies_authored),
                        replies_received: safeNumber(postMetrics.replies_received),
                        reactions_received: safeNumber(postMetrics.reactions_received),
                        shares_received: safeNumber(postMetrics.shares_received),
                        bookmarks_received: safeNumber(postMetrics.bookmarks_received),
                        restreams_received: safeNumber(postMetrics.restreams_received),
                        views_received: safeNumber(postMetrics.views_received),
                        video_posts: safeNumber(postMetrics.video_posts),
                        open_reports: safeNumber(reportMetrics.open_reports),
                        blocked_posts: safeNumber(postMetrics.blocked_posts),
                        restricted_posts: safeNumber(postMetrics.restricted_posts),
                        featured_posts: safeNumber(postMetrics.featured_posts),
                        trust_score: trustScore,
                        growth_score: growthScore,
                        is_featured_creator: Boolean(user?.stream_creator_featured || false),
                        featured_creator_updated_at: user?.stream_creator_featured_updated_at || null,
                        can_promote_to_author: String(user?.role || "user") === "user",
                        can_demote_to_user: String(user?.role || "") === "author",
                    };
                })
                .sort((a, b) => {
                    const growthDiff = safeNumber(b.growth_score) - safeNumber(a.growth_score);
                    if (growthDiff !== 0) return growthDiff;
                    const trustDiff = safeNumber(b.trust_score) - safeNumber(a.trust_score);
                    if (trustDiff !== 0) return trustDiff;
                    return safeNumber(b.views_received) - safeNumber(a.views_received);
                })
                .slice(0, limit);

            return res.json({
                success: true,
                generated_at: now.toISOString(),
                window_days: windowDays,
                creators,
                count: creators.length,
            });
        } catch (error) {
            console.error("Error loading creator leaderboard:", error);
            return res.status(500).json({ success: false, message: "Failed to load creator leaderboard" });
        }
    });
}

module.exports = mountAnalyticsRoutes;
