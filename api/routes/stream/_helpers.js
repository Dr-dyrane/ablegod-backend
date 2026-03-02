const { v4: uuidv4 } = require("uuid");
const StreamPost = require("../../models/streamPost");
const StreamReply = require("../../models/streamReply");
const StreamReaction = require("../../models/streamReaction");
const StreamBookmark = require("../../models/streamBookmark");
const StreamRestream = require("../../models/streamRestream");
const StreamFollow = require("../../models/streamFollow");
const StreamReport = require("../../models/streamReport");
const StreamModerationAction = require("../../models/streamModerationAction");
const StreamShare = require("../../models/streamShare");
const StreamCircle = require("../../models/streamCircle");
const StreamCircleMember = require("../../models/streamCircleMember");
const Notification = require("../../models/notification");
const User = require("../../models/user");

// ─── Reaction Utilities ───

const REACTION_TYPES = ["like", "amen", "pray"];

const emptyReactionCounts = () => ({ like: 0, amen: 0, pray: 0 });

const sanitizeReactionCounts = (value) => {
    const counts = emptyReactionCounts();
    if (value && typeof value === "object") {
        for (const type of REACTION_TYPES) {
            counts[type] = Math.max(0, Number(value[type] || 0));
        }
    }
    return counts;
};

const totalReactionsFromCounts = (counts) =>
    REACTION_TYPES.reduce((sum, type) => sum + Math.max(0, Number(counts?.[type] || 0)), 0);

const normalizeReactionType = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return REACTION_TYPES.includes(normalized) ? normalized : null;
};

// ─── Metadata ───

const ensureMetadataObject = (record) => {
    if (!record) return {};
    const metadata =
        record.metadata && typeof record.metadata === "object" ? { ...record.metadata } : {};
    record.metadata = metadata;
    return metadata;
};

// ─── Auth Display Name ───

const getAuthDisplayName = (authUser, fallback = "User") =>
    [String(authUser?.first_name), String(authUser?.last_name)]
        .filter((value) => value && value !== "undefined")
        .join(" ")
        .trim() || authUser?.username || authUser?.email || fallback;

const getDisplayNameFromUser = (user) =>
    [String(user?.first_name), String(user?.last_name)]
        .filter((value) => value && value !== "undefined")
        .join(" ")
        .trim() || user?.username || user?.email || "Member";

// ─── Serializers ───

const serializePost = (post, options = {}) => {
    const reactionCounts = sanitizeReactionCounts(post.reaction_counts);
    const totalReactions = totalReactionsFromCounts(reactionCounts);
    return {
        id: String(post.id),
        author_user_id: String(post.author_user_id || ""),
        author_name: String(post.author_name || ""),
        author_username: String(post.author_username || ""),
        author_avatar_url: String(post.author_avatar_url || ""),
        author_role: String(post.author_role || "user"),
        intent: String(post.intent || "Reflection"),
        title: String(post.title || ""),
        content: String(post.content || ""),
        excerpt: String(post.excerpt || ""),
        image_url: String(post.image_url || ""),
        media_url: String(post.media_url || post.image_url || ""),
        media_type: String(post.media_type || post?.metadata?.media_type || "image"),
        status: String(post.status || "published"),
        reply_count: Number(post.reply_count || 0),
        like_count: Number(post.like_count || totalReactions),
        bookmark_count: Number(post.bookmark_count || 0),
        restream_count: Number(post.restream_count || 0),
        share_count: Number(post.share_count || 0),
        view_count: Number(post.view_count || 0),
        reaction_counts: reactionCounts,
        viewer_reaction: options.viewerReaction ? String(options.viewerReaction) : null,
        is_bookmarked: Boolean(options.viewerBookmark),
        is_restreamed: Boolean(options.viewerRestream),
        metadata: post.metadata || {},
        is_edited: post.edit_history && post.edit_history.length > 0,
        edit_history: post.edit_history || [],
        created_at: post.created_at,
        updated_at: post.updated_at,
    };
};

const serializeReply = (reply, options = {}) => {
    const reactionCounts = sanitizeReactionCounts(reply.reaction_counts);
    const totalReactions = totalReactionsFromCounts(reactionCounts);
    return {
        id: String(reply.id),
        post_id: String(reply.post_id),
        parent_reply_id: reply.parent_reply_id ? String(reply.parent_reply_id) : null,
        author_user_id: String(reply.author_user_id || ""),
        author_name: String(reply.author_name || ""),
        author_username: String(reply.author_username || ""),
        author_avatar_url: String(reply.author_avatar_url || ""),
        author_role: String(reply.author_role || "user"),
        content: String(reply.content || ""),
        status: String(reply.status || "published"),
        like_count: Number(reply.like_count || totalReactions),
        restream_count: Number(reply.restream_count || 0),
        bookmark_count: Number(reply.bookmark_count || 0),
        share_count: Number(reply.share_count || 0),
        view_count: Number(reply.view_count || 0),
        reaction_counts: reactionCounts,
        viewer_reaction: options.viewerReaction ? String(options.viewerReaction) : null,
        is_bookmarked: Boolean(options.viewerBookmark),
        is_restreamed: Boolean(options.viewerRestream),
        metadata: reply.metadata || {},
        created_at: reply.created_at,
        updated_at: reply.updated_at,
    };
};

const serializeReport = (report) => ({
    id: String(report.id || ""),
    target_type: String(report.target_type || "post"),
    target_id: String(report.target_id || ""),
    post_id: String(report.post_id || ""),
    reply_id: report.reply_id ? String(report.reply_id) : null,
    reported_user_id: String(report.reported_user_id || ""),
    reporter_user_id: String(report.reporter_user_id || ""),
    reporter_name: String(report.reporter_name || "Member"),
    reason: String(report.reason || "other"),
    note: String(report.note || ""),
    status: String(report.status || "open"),
    resolved_by_user_id: report.resolved_by_user_id ? String(report.resolved_by_user_id) : null,
    resolved_by_name: report.resolved_by_name ? String(report.resolved_by_name) : null,
    resolved_at: report.resolved_at || null,
    metadata: report.metadata && typeof report.metadata === "object" ? report.metadata : {},
    created_at: report.created_at,
    updated_at: report.updated_at || report.created_at,
});

const serializeModerationAction = (action) => ({
    id: String(action.id || ""),
    target_type: String(action.target_type || "post"),
    target_id: String(action.target_id || ""),
    post_id: String(action.post_id || ""),
    reply_id: action.reply_id ? String(action.reply_id) : null,
    action_scope: String(action.action_scope || "moderation"),
    action: String(action.action || ""),
    status: String(action.status || ""),
    note: String(action.note || ""),
    actor_user_id: String(action.actor_user_id || ""),
    actor_name: String(action.actor_name || "Admin"),
    metadata: action.metadata && typeof action.metadata === "object" ? action.metadata : {},
    created_at: action.created_at,
});

// ─── Viewer State Builders ───

const buildViewerReactionMap = async ({ userId, targetType, targetIds }) => {
    const ids = Array.isArray(targetIds)
        ? [...new Set(targetIds.map((id) => String(id || "")).filter(Boolean))]
        : [];
    if (!userId || ids.length === 0) return new Map();

    const reactions = await StreamReaction.find({
        target_type: String(targetType),
        user_id: String(userId),
        target_id: { $in: ids },
    });

    return new Map(
        reactions.map((reaction) => [String(reaction.target_id), String(reaction.reaction_type)])
    );
};

const buildViewerBookmarkSet = async ({ userId, postIds }) => {
    const ids = Array.isArray(postIds) ? [...new Set(postIds.map(String).filter(Boolean))] : [];
    if (!userId || ids.length === 0) return new Set();
    const bookmarks = await StreamBookmark.find({ user_id: String(userId), post_id: { $in: ids } }, { post_id: 1 });
    return new Set(bookmarks.map(b => String(b.post_id)));
};

const buildViewerRestreamSet = async ({ userId, postIds }) => {
    const ids = Array.isArray(postIds) ? [...new Set(postIds.map(String).filter(Boolean))] : [];
    if (!userId || ids.length === 0) return new Set();
    const restreams = await StreamRestream.find({ user_id: String(userId), post_id: { $in: ids } }, { post_id: 1 });
    return new Set(restreams.map(r => String(r.post_id)));
};

// ─── Reaction Count Management ───

const recomputeTargetReactionCounts = async ({ targetType, targetId }) => {
    const reactions = await StreamReaction.find({
        target_type: String(targetType),
        target_id: String(targetId),
    });
    const counts = emptyReactionCounts();
    for (const reaction of reactions) {
        const reactionType = normalizeReactionType(reaction.reaction_type);
        if (!reactionType) continue;
        counts[reactionType] += 1;
    }
    return counts;
};

const persistTargetReactionCounts = async ({ targetType, target, counts }) => {
    const nextCounts = sanitizeReactionCounts(counts);
    target.reaction_counts = nextCounts;
    target.like_count = totalReactionsFromCounts(nextCounts);
    target.updated_at = new Date().toISOString();
    await target.save();
    return nextCounts;
};

// ─── Feed Ranking ───

const getPostCreatedAt = (post) => {
    const timestamp = new Date(post?.created_at || 0).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const computeExploreScore = (post) => {
    const createdAt = getPostCreatedAt(post);
    const hoursSincePost = Math.max(1, (Date.now() - createdAt) / (1000 * 60 * 60));
    const replyWeight = Number(post?.reply_count || 0) * 4;
    const likeWeight = Number(post?.like_count || 0) * 2;
    const reactionCounts = sanitizeReactionCounts(post?.reaction_counts);
    const reactionDiversityWeight =
        REACTION_TYPES.filter((type) => Number(reactionCounts[type] || 0) > 0).length * 1.25;
    const qualityDepthWeight = Math.min(
        3,
        Math.max(
            0,
            Math.floor(String(post?.content || post?.excerpt || "").trim().length / 180)
        )
    );
    const recencyWeight = Math.max(0, 48 - hoursSincePost) * 0.25;
    const metadata =
        post?.metadata && typeof post.metadata === "object" ? post.metadata : {};
    const explicitTrustScore = Number(metadata.trust_score ?? metadata.trustScore ?? 0);
    const editorialBoost = Number(metadata.editorial_boost ?? metadata.editorialBoost ?? 0);
    const reportCount = Number(metadata.report_count ?? metadata.reports ?? 0);
    const moderationFlags = Array.isArray(metadata.moderation_flags)
        ? metadata.moderation_flags.length
        : Number(metadata.moderation_flags_count || 0);
    const moderationStatus = String(metadata.moderation_status || "").toLowerCase();
    const role = String(post?.author_role || "").toLowerCase();

    const roleTrustWeight =
        role === "admin" || role === "author" ? 1.5 : 0;
    const trustWeight = Math.max(-6, Math.min(6, explicitTrustScore)) + roleTrustWeight;
    const editorialWeight = Math.max(0, Math.min(8, editorialBoost)) * 1.25;
    const moderationPenalty =
        Math.max(0, reportCount) * 3 + Math.max(0, moderationFlags) * 2;
    const reviewPenalty =
        moderationStatus === "review"
            ? 6
            : moderationStatus === "restricted" || moderationStatus === "blocked"
                ? 100
                : 0;

    return (
        replyWeight +
        likeWeight +
        reactionDiversityWeight +
        qualityDepthWeight +
        recencyWeight +
        trustWeight +
        editorialWeight -
        moderationPenalty -
        reviewPenalty
    );
};

const sortPostsForFeed = (posts, feed, authUserId) => {
    const normalizedFeed = String(feed || "following").toLowerCase();
    const cloned = [...posts];

    if (normalizedFeed === "explore") {
        return cloned.sort((a, b) => {
            const scoreDelta = computeExploreScore(b) - computeExploreScore(a);
            if (scoreDelta !== 0) return scoreDelta;
            return getPostCreatedAt(b) - getPostCreatedAt(a);
        });
    }

    return cloned.sort((a, b) => getPostCreatedAt(b) - getPostCreatedAt(a));
};

// ─── Follow Graph Queries ───

const getFollowSetForUser = async (userId) => {
    const normalizedUserId = String(userId || "");
    if (!normalizedUserId) return new Set();
    const follows = await StreamFollow.find({
        follower_user_id: normalizedUserId,
        status: "active",
    });
    return new Set(follows.map((follow) => String(follow.followed_user_id)));
};

const buildFollowSnapshot = async (userId) => {
    const normalizedUserId = String(userId || "");
    const [following, followers] = await Promise.all([
        StreamFollow.find({ follower_user_id: normalizedUserId, status: "active" }).sort({ created_at: -1 }),
        StreamFollow.find({ followed_user_id: normalizedUserId, status: "active" }).sort({ created_at: -1 }),
    ]);

    return {
        following: following.map((follow) => ({
            id: String(follow.id),
            user_id: String(follow.followed_user_id),
            name: String(follow.followed_name || ""),
            created_at: follow.created_at,
        })),
        followers: followers.map((follow) => ({
            id: String(follow.id),
            user_id: String(follow.follower_user_id),
            name: String(follow.follower_name || ""),
            created_at: follow.created_at,
        })),
    };
};

// ─── Notification Helpers ───

const createReactionNotification = async ({
    authUser,
    targetAuthorUserId,
    targetKind,
    streamPost,
    streamReply,
    reactionType,
    emitNotificationEvent,
}) => {
    const targetUserId = String(targetAuthorUserId || "");
    if (!targetUserId || targetUserId === String(authUser.id)) return null;

    const actorName = getAuthDisplayName(authUser, "User");
    const now = new Date().toISOString();

    const notification = new Notification({
        id: uuidv4(),
        user_id: targetUserId,
        type: "like",
        message: `${actorName} reacted (${reactionType}) to your ${targetKind}`,
        post_id: null,
        post_title:
            streamPost?.title || streamPost?.excerpt || (targetKind === "reply" ? "Your reply" : "Stream post"),
        metadata: {
            kind: "stream_reaction",
            reaction_type: reactionType,
            stream_post_id: streamPost ? String(streamPost.id) : null,
            stream_reply_id: streamReply ? String(streamReply.id) : null,
            target_kind: targetKind,
            actor_user_id: String(authUser.id),
            actor_name: actorName,
        },
        is_read: false,
        created_at: now,
        read_at: null,
    });
    const saved = await notification.save();
    if (emitNotificationEvent) emitNotificationEvent(saved);
    return saved;
};

// ─── Moderation Helpers ───

const syncPostReportSummary = async (post) => {
    if (!post) return post;
    const metadata = ensureMetadataObject(post);
    const activeReports = await StreamReport.find({
        target_type: "post",
        post_id: String(post.id),
        status: { $in: ["open", "under_review"] },
    })
        .sort({ updated_at: -1, created_at: -1 })
        .limit(50);
    metadata.report_events = activeReports.map((report) => ({
        id: String(report.id),
        user_id: String(report.reporter_user_id || ""),
        user_name: String(report.reporter_name || "Member"),
        reason: String(report.reason || "other"),
        note: String(report.note || ""),
        status: String(report.status || "open"),
        created_at: report.created_at,
        updated_at: report.updated_at || report.created_at,
        target_type: "post",
        target_id: String(report.target_id || post.id),
    }));
    metadata.report_count = metadata.report_events.length;
    if (!metadata.report_count && String(metadata.moderation_status || "").toLowerCase() === "review") {
        delete metadata.moderation_status;
    }
    return post;
};

const syncReplyReportSummary = async (reply) => {
    if (!reply) return reply;
    const metadata = ensureMetadataObject(reply);
    const activeReports = await StreamReport.find({
        target_type: "reply",
        reply_id: String(reply.id),
        status: { $in: ["open", "under_review"] },
    })
        .sort({ updated_at: -1, created_at: -1 })
        .limit(50);
    metadata.report_events = activeReports.map((report) => ({
        id: String(report.id),
        user_id: String(report.reporter_user_id || ""),
        user_name: String(report.reporter_name || "Member"),
        reason: String(report.reason || "other"),
        note: String(report.note || ""),
        status: String(report.status || "open"),
        created_at: report.created_at,
        updated_at: report.updated_at || report.created_at,
        target_type: "reply",
        target_id: String(report.target_id || reply.id),
    }));
    metadata.report_count = metadata.report_events.length;
    if (!metadata.report_count && String(metadata.moderation_status || "").toLowerCase() === "review") {
        delete metadata.moderation_status;
    }
    return reply;
};

const upsertStreamReport = async ({
    targetType, targetId, postId, replyId = null,
    reportedUserId = "", authUser, reason, note,
}) => {
    const reporterUserId = String(authUser?.id || "");
    const now = new Date().toISOString();
    const existing = await StreamReport.findOne({
        target_type: String(targetType),
        target_id: String(targetId),
        reporter_user_id: reporterUserId,
        status: { $in: ["open", "under_review"] },
    }).sort({ updated_at: -1, created_at: -1 });

    const payload = {
        target_type: String(targetType),
        target_id: String(targetId),
        post_id: String(postId || ""),
        reply_id: replyId ? String(replyId) : null,
        reported_user_id: String(reportedUserId || ""),
        reporter_user_id: reporterUserId,
        reporter_name: getAuthDisplayName(authUser, "Member"),
        reason: String(reason || "other"),
        note: String(note || ""),
        status: "open",
        resolved_by_user_id: null,
        resolved_by_name: null,
        resolved_at: null,
        updated_at: now,
    };

    if (existing) {
        Object.assign(existing, payload);
        await existing.save();
        return existing;
    }

    return new StreamReport({
        id: uuidv4(),
        ...payload,
        created_at: now,
        metadata: {},
    }).save();
};

const markReportsForTarget = async ({ targetType, targetId, authUser, status }) => {
    const normalizedStatus =
        status === "resolved" || status === "under_review" || status === "open"
            ? status
            : "open";
    const now = new Date().toISOString();
    const actorId = String(authUser?.id || "");
    const actorName = getAuthDisplayName(authUser, "Admin");
    await StreamReport.updateMany(
        {
            target_type: String(targetType),
            target_id: String(targetId),
            status: { $in: ["open", "under_review"] },
        },
        {
            $set: {
                status: normalizedStatus,
                updated_at: now,
                resolved_by_user_id: normalizedStatus === "resolved" ? actorId : null,
                resolved_by_name: normalizedStatus === "resolved" ? actorName : null,
                resolved_at: normalizedStatus === "resolved" ? now : null,
            },
        }
    );
};

const createModerationActionRecord = async ({
    targetType, targetId, postId, replyId = null,
    actionScope = "moderation", action, status, note, authUser, metadata = {},
}) => {
    const now = new Date().toISOString();
    return new StreamModerationAction({
        id: uuidv4(),
        target_type: String(targetType),
        target_id: String(targetId),
        post_id: String(postId || ""),
        reply_id: replyId ? String(replyId) : null,
        action_scope: String(actionScope || "moderation"),
        action: String(action || ""),
        status: String(status || ""),
        note: String(note || ""),
        actor_user_id: String(authUser?.id || ""),
        actor_name: getAuthDisplayName(authUser, "Admin"),
        metadata: metadata && typeof metadata === "object" ? metadata : {},
        created_at: now,
    }).save();
};

const loadStreamAuditBundle = async (postId) => {
    const normalizedPostId = String(postId || "");
    const [post, replies, reports, actions] = await Promise.all([
        StreamPost.findOne({ id: normalizedPostId }),
        StreamReply.find({ post_id: normalizedPostId }).sort({ created_at: 1 }),
        StreamReport.find({ post_id: normalizedPostId }).sort({ created_at: -1 }).limit(200),
        StreamModerationAction.find({ post_id: normalizedPostId }).sort({ created_at: -1 }).limit(200),
    ]);

    if (!post) return null;

    return { post, replies, reports, actions };
};

module.exports = {
    // Constants
    REACTION_TYPES,
    // Reaction utils
    emptyReactionCounts, sanitizeReactionCounts, totalReactionsFromCounts, normalizeReactionType,
    // Metadata
    ensureMetadataObject,
    // Display names
    getAuthDisplayName, getDisplayNameFromUser,
    // Serializers
    serializePost, serializeReply, serializeReport, serializeModerationAction,
    // Viewer state
    buildViewerReactionMap, buildViewerBookmarkSet, buildViewerRestreamSet,
    // Reaction counts
    recomputeTargetReactionCounts, persistTargetReactionCounts,
    // Ranking
    getPostCreatedAt, computeExploreScore, sortPostsForFeed,
    // Follow
    getFollowSetForUser, buildFollowSnapshot,
    // Notifications
    createReactionNotification,
    // Moderation
    syncPostReportSummary, syncReplyReportSummary,
    upsertStreamReport, markReportsForTarget,
    createModerationActionRecord, loadStreamAuditBundle,
    // Models (re-export for convenience)
    StreamPost, StreamReply, StreamReaction, StreamBookmark, StreamRestream,
    StreamFollow, StreamReport, StreamModerationAction, StreamShare,
    StreamCircle, StreamCircleMember,
    Notification, User,
};
