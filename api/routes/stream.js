const express = require("express");
const { v4: uuidv4 } = require("uuid");
const StreamPost = require("../models/streamPost");
const StreamReply = require("../models/streamReply");
const StreamReaction = require("../models/streamReaction");
const StreamBookmark = require("../models/streamBookmark");
const StreamRestream = require("../models/streamRestream");
const StreamFollow = require("../models/streamFollow");
const StreamReport = require("../models/streamReport");
const StreamModerationAction = require("../models/streamModerationAction");
const Notification = require("../models/notification");
const User = require("../models/user");
const { requireCapabilities } = require("../middleware/auth");

function createStreamRoutes(pusher) {
	const router = express.Router();

	const requireFeedRead = requireCapabilities("stream:read", "feed:read");
	const requirePostCreate = requireCapabilities("stream:create");
	const requirePostInteract = requireCapabilities("stream:reply", "post:interact");
	const requireFollowRead = requireCapabilities("follow:read", "stream:read");
	const requireFollowWrite = requireCapabilities("follow:write");
	const requireStreamModerate = requireCapabilities("stream:moderate");
	const requireStreamFeature = requireCapabilities("stream:feature", "stream:moderate");

	const emitNotificationEvent = (notification) => {
		if (!pusher || !notification?.user_id) return;
		const payload = {
			id: notification.id,
			type: notification.type,
			message: notification.message,
			post_id: notification.post_id ?? null,
			post_title: notification.post_title || "",
			is_read: notification.is_read,
			created_at: notification.created_at,
			user_id: notification.user_id,
			metadata: notification.metadata || {},
		};
		pusher.trigger(`user-${notification.user_id}`, "notification:new", payload);
	};

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

	const serializePost = (post, options = {}) => {
		const reactionCounts = sanitizeReactionCounts(post.reaction_counts);
		const totalReactions = totalReactionsFromCounts(reactionCounts);
		return {
			id: String(post.id),
			author_user_id: String(post.author_user_id || ""),
			author_name: String(post.author_name || ""),
			author_role: String(post.author_role || "user"),
			intent: String(post.intent || "Reflection"),
			title: String(post.title || ""),
			content: String(post.content || ""),
			excerpt: String(post.excerpt || ""),
			image_url: String(post.image_url || ""),
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
			author_role: String(reply.author_role || "user"),
			content: String(reply.content || ""),
			status: String(reply.status || "published"),
			like_count: Number(reply.like_count || totalReactions),
			reaction_counts: reactionCounts,
			viewer_reaction: options.viewerReaction ? String(options.viewerReaction) : null,
			metadata: reply.metadata || {},
			created_at: reply.created_at,
			updated_at: reply.updated_at,
		};
	};

	const ensureMetadataObject = (record) => {
		if (!record) return {};
		const metadata =
			record.metadata && typeof record.metadata === "object" ? { ...record.metadata } : {};
		record.metadata = metadata;
		return metadata;
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

	const getAuthDisplayName = (authUser, fallback = "User") =>
		[String(authUser?.first_name), String(authUser?.last_name)]
			.filter((value) => value && value !== "undefined")
			.join(" ")
			.trim() || authUser?.username || authUser?.email || fallback;

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
		targetType,
		targetId,
		postId,
		replyId = null,
		reportedUserId = "",
		authUser,
		reason,
		note,
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

	const markReportsForTarget = async ({
		targetType,
		targetId,
		authUser,
		status,
	}) => {
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
		targetType,
		targetId,
		postId,
		replyId = null,
		actionScope = "moderation",
		action,
		status,
		note,
		authUser,
		metadata = {},
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

		return {
			post,
			replies,
			reports,
			actions,
		};
	};

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

		// Following feed placeholder until follow graph lands:
		return cloned.sort((a, b) => getPostCreatedAt(b) - getPostCreatedAt(a));
	};

	const getDisplayNameFromUser = (user) =>
		[String(user?.first_name), String(user?.last_name)]
			.filter((value) => value && value !== "undefined")
			.join(" ")
			.trim() || user?.username || user?.email || "Member";

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

	const createReactionNotification = async ({
		authUser,
		targetAuthorUserId,
		targetKind,
		streamPost,
		streamReply,
		reactionType,
	}) => {
		const targetUserId = String(targetAuthorUserId || "");
		if (!targetUserId || targetUserId === String(authUser.id)) return null;

		const actorName =
			[String(authUser.first_name), String(authUser.last_name)]
				.filter((value) => value && value !== "undefined")
				.join(" ")
				.trim() || authUser.username || authUser.email || "User";
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
		emitNotificationEvent(saved);
		return saved;
	};

	router.get("/posts", ...requireFeedRead, async (req, res) => {
		try {
			const limitRaw = Number.parseInt(String(req.query.limit || "30"), 10);
			const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 30;
			const status = String(req.query.status || "published");
			const feed = String(req.query.feed || "following").toLowerCase();

			const query = status === "all" ? {} : { status };
			const candidateLimit = feed === "explore" ? Math.min(limit * 3, 200) : limit;
			let posts = await StreamPost.find(query).sort({ created_at: -1 }).limit(candidateLimit);
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
				const bookmarks = await StreamBookmark.find({ user_id: String(authUserId) }).sort({ created_at: -1 });
				const bookmarkPostIds = bookmarks.map(b => String(b.post_id));
				posts = await StreamPost.find({ id: { $in: bookmarkPostIds }, ...query });

				// Re-sort them based on bookmark order
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

			return res.json({
				success: true,
				feed,
				feed_context: feedContext,
				posts: sortedPosts.map((post) =>
					serializePost(post, {
						viewerReaction: viewerReactionMap.get(String(post.id)),
						viewerBookmark: viewerBookmarkSet.has(String(post.id)),
						viewerRestream: viewerRestreamSet.has(String(post.id)),
					})
				),
			});
		} catch (error) {
			console.error("Error listing stream posts:", error);
			return res.status(500).json({ success: false, message: "Failed to fetch stream posts" });
		}
	});

	router.post("/posts", ...requirePostCreate, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const {
				title = "",
				content = "",
				excerpt = "",
				intent = "Reflection",
				image_url,
				imageUrl,
				status = "published",
				metadata = {},
			} = req.body || {};

			const normalizedContent = String(content || "").trim();
			if (!normalizedContent) {
				return res.status(400).json({ success: false, message: "content is required" });
			}

			const now = new Date().toISOString();
			const post = new StreamPost({
				id: uuidv4(),
				author_user_id: String(authUser.id),
				author_name:
					[String(authUser.first_name), String(authUser.last_name)]
						.filter((value) => value && value !== "undefined")
						.join(" ")
						.trim() || authUser.username || authUser.email || "User",
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
			return res.status(201).json({
				success: true,
				post: serializePost(post),
			});
		} catch (error) {
			console.error("Error creating stream post:", error);
			return res.status(500).json({ success: false, message: "Failed to create stream post" });
		}
	});

	router.get("/follows/me", ...requireFollowRead, async (req, res) => {
		try {
			const authUserId = String(req.auth?.user?.id || "");
			const snapshot = await buildFollowSnapshot(authUserId);
			return res.json({
				success: true,
				user_id: authUserId,
				following: snapshot.following,
				followers: snapshot.followers,
				counts: {
					following: snapshot.following.length,
					followers: snapshot.followers.length,
				},
			});
		} catch (error) {
			console.error("Error fetching follow snapshot:", error);
			return res.status(500).json({ success: false, message: "Failed to fetch follows" });
		}
	});

	router.get("/suggestions", ...requireFollowRead, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const authUserId = String(authUser.id || "");
			const limitRaw = Number.parseInt(String(req.query.limit || "8"), 10);
			const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 8;
			const search = String(req.query.q || "").trim().toLowerCase();

			const followingSet = await getFollowSetForUser(authUserId);
			const users = await User.find({
				status: { $ne: "inactive" },
			}).limit(200);

			const suggestions = users
				.filter((user) => {
					const userId = String(user.id || "");
					if (!userId || userId === authUserId) return false;
					if (followingSet.has(userId)) return false;
					if (search) {
						const haystack = [
							String(user.username || ""),
							String(user.email || ""),
							String(user.first_name || ""),
							String(user.last_name || ""),
						]
							.join(" ")
							.toLowerCase();
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
			const followerCountMap = new Map(
				followerCounts.map((row) => [String(row._id), Number(row.follower_count || 0)])
			);

			return res.json({
				success: true,
				suggestions: suggestions.map((user) => ({
					id: String(user.id || ""),
					username: String(user.username || ""),
					name: getDisplayNameFromUser(user),
					role: String(user.role || "user"),
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
			if (!targetUser) {
				return res.status(404).json({ success: false, message: "User not found" });
			}

			let existing = await StreamFollow.findOne({
				follower_user_id: followerUserId,
				followed_user_id: followedUserId,
			});

			let isFollowing = false;
			const now = new Date().toISOString();

			if (!follow) {
				if (existing) {
					await existing.deleteOne();
				}
			} else if (!existing) {
				existing = await new StreamFollow({
					id: uuidv4(),
					follower_user_id: followerUserId,
					followed_user_id: followedUserId,
					follower_name: getDisplayNameFromUser(authUser),
					followed_name: getDisplayNameFromUser(targetUser),
					status: "active",
					created_at: now,
					updated_at: now,
				}).save();
				isFollowing = true;

				if (String(targetUser.id) !== followerUserId) {
					const notification = await new Notification({
						id: uuidv4(),
						user_id: String(targetUser.id),
						type: "system",
						message: `${getDisplayNameFromUser(authUser)} followed you`,
						post_id: null,
						post_title: "",
						metadata: {
							kind: "stream_follow",
							actor_user_id: followerUserId,
							actor_name: getDisplayNameFromUser(authUser),
						},
						is_read: false,
						created_at: now,
						read_at: null,
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
						follower_user_id: followerUserId,
						followed_user_id: followedUserId,
						status: "active",
					})
				);
			}

			const [followersCount, followingCount] = await Promise.all([
				StreamFollow.countDocuments({ followed_user_id: followedUserId, status: "active" }),
				StreamFollow.countDocuments({ follower_user_id: followerUserId, status: "active" }),
			]);

			return res.json({
				success: true,
				following: isFollowing,
				target: {
					user_id: followedUserId,
					name: getDisplayNameFromUser(targetUser),
				},
				counts: {
					target_followers: followersCount,
					viewer_following: followingCount,
				},
			});
		} catch (error) {
			console.error("Error updating follow state:", error);
			return res.status(500).json({ success: false, message: "Failed to update follow state" });
		}
	});

	router.get("/posts/:id", ...requireFeedRead, async (req, res) => {
		try {
			const post = await StreamPost.findOne({ id: String(req.params.id) });
			if (!post) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}
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

	router.get("/posts/:id/replies", ...requireFeedRead, async (req, res) => {
		try {
			const postId = String(req.params.id || "");
			const post = await StreamPost.findOne({ id: postId });
			if (!post) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}

			const replies = await StreamReply.find({ post_id: postId, status: "published" }).sort({
				created_at: 1,
			});
			const viewerReplyReactionMap = await buildViewerReactionMap({
				userId: req.auth?.user?.id,
				targetType: "reply",
				targetIds: replies.map((reply) => reply.id),
			});
			const viewerPostReactionMap = await buildViewerReactionMap({
				userId: req.auth?.user?.id,
				targetType: "post",
				targetIds: [post.id],
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

	router.post("/posts/:id/replies", ...requirePostInteract, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const postId = String(req.params.id || "");
			const { content = "", parent_reply_id = null, metadata = {} } = req.body || {};
			const normalizedContent = String(content || "").trim();

			if (!normalizedContent) {
				return res.status(400).json({ success: false, message: "content is required" });
			}

			const post = await StreamPost.findOne({ id: postId });
			if (!post) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}

			const now = new Date().toISOString();
			const reply = new StreamReply({
				id: uuidv4(),
				post_id: postId,
				parent_reply_id: parent_reply_id ? String(parent_reply_id) : null,
				author_user_id: String(authUser.id),
				author_name:
					[String(authUser.first_name), String(authUser.last_name)]
						.filter((value) => value && value !== "undefined")
						.join(" ")
						.trim() || authUser.username || authUser.email || "User",
				author_role: String(authUser.role || "user"),
				content: normalizedContent,
				status: "published",
				metadata,
				created_at: now,
				updated_at: now,
			});

			await reply.save();
			post.reply_count = Number(post.reply_count || 0) + 1;
			post.updated_at = now;
			await post.save();

			const postAuthorId = String(post.author_user_id || "");
			if (postAuthorId && postAuthorId !== String(authUser.id)) {
				const notification = new Notification({
					id: uuidv4(),
					user_id: postAuthorId,
					type: "comment",
					message: `${reply.author_name} replied to your stream post`,
					post_id: null,
					post_title: post.title || post.excerpt || "Stream post",
					metadata: {
						kind: "stream_reply",
						stream_post_id: post.id,
						reply_id: reply.id,
						actor_user_id: String(authUser.id),
						actor_name: reply.author_name,
					},
					is_read: false,
					created_at: now,
					read_at: null,
				});
				const savedNotification = await notification.save();
				emitNotificationEvent(savedNotification);
			}

			return res.status(201).json({
				success: true,
				reply: serializeReply(reply),
				post: serializePost(post),
			});
		} catch (error) {
			console.error("Error creating stream reply:", error);
			return res.status(500).json({ success: false, message: "Failed to create reply" });
		}
	});

	router.post("/posts/:id/report", ...requirePostInteract, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const postId = String(req.params.id || "");
			const reason = String(req.body?.reason || "other").trim().slice(0, 80) || "other";
			const note = String(req.body?.note || "").trim().slice(0, 500);

			const post = await StreamPost.findOne({ id: postId });
			if (!post) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}
			const now = new Date().toISOString();
			await upsertStreamReport({
				targetType: "post",
				targetId: postId,
				postId: postId,
				reportedUserId: String(post.author_user_id || ""),
				authUser,
				reason,
				note,
			});

			const metadata = ensureMetadataObject(post);
			if (!metadata.moderation_status) {
				metadata.moderation_status = "review";
			}
			post.updated_at = now;
			await syncPostReportSummary(post);
			await post.save();

			return res.status(201).json({
				success: true,
				message: "Report submitted",
				post: serializePost(post),
				report_count: Number(metadata.report_count || 0),
				moderation_status: String(metadata.moderation_status || ""),
			});
		} catch (error) {
			console.error("Error reporting stream post:", error);
			return res.status(500).json({ success: false, message: "Failed to submit report" });
		}
	});

	router.post("/posts/:postId/replies/:replyId/report", ...requirePostInteract, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const postId = String(req.params.postId || "");
			const replyId = String(req.params.replyId || "");
			const reason = String(req.body?.reason || "other").trim().slice(0, 80) || "other";
			const note = String(req.body?.note || "").trim().slice(0, 500);

			const [post, reply] = await Promise.all([
				StreamPost.findOne({ id: postId }),
				StreamReply.findOne({ id: replyId, post_id: postId }),
			]);
			if (!post) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}
			if (!reply) {
				return res.status(404).json({ success: false, message: "Stream reply not found" });
			}

			const now = new Date().toISOString();
			await upsertStreamReport({
				targetType: "reply",
				targetId: replyId,
				postId,
				replyId,
				reportedUserId: String(reply.author_user_id || ""),
				authUser,
				reason,
				note,
			});

			const replyMetadata = ensureMetadataObject(reply);
			if (!replyMetadata.moderation_status) {
				replyMetadata.moderation_status = "review";
			}
			reply.updated_at = now;
			await syncReplyReportSummary(reply);
			await reply.save();

			return res.status(201).json({
				success: true,
				message: "Reply report submitted",
				reply: serializeReply(reply),
				report_count: Number(reply.metadata?.report_count || 0),
				moderation_status: String(reply.metadata?.moderation_status || ""),
			});
		} catch (error) {
			console.error("Error reporting stream reply:", error);
			return res.status(500).json({ success: false, message: "Failed to submit reply report" });
		}
	});

	router.put("/posts/:id/reaction", ...requirePostInteract, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const postId = String(req.params.id || "");
			const reactionType = normalizeReactionType(req.body?.reaction_type || req.body?.reaction);

			const post = await StreamPost.findOne({ id: postId });
			if (!post) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}

			const existing = await StreamReaction.findOne({
				target_type: "post",
				target_id: postId,
				user_id: String(authUser.id),
			});

			let viewerReaction = null;

			if (!reactionType) {
				if (existing) {
					await existing.deleteOne();
				}
			} else if (!existing) {
				const actorName =
					[String(authUser.first_name), String(authUser.last_name)]
						.filter((value) => value && value !== "undefined")
						.join(" ")
						.trim() || authUser.username || authUser.email || "User";
				await new StreamReaction({
					id: uuidv4(),
					target_type: "post",
					target_id: postId,
					post_id: postId,
					reply_id: null,
					user_id: String(authUser.id),
					user_name: actorName,
					reaction_type: reactionType,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				}).save();
				viewerReaction = reactionType;
				await createReactionNotification({
					authUser,
					targetAuthorUserId: post.author_user_id,
					targetKind: "stream post",
					streamPost: post,
					reactionType,
				});
			} else if (String(existing.reaction_type) === reactionType) {
				await existing.deleteOne();
			} else {
				existing.reaction_type = reactionType;
				existing.updated_at = new Date().toISOString();
				await existing.save();
				viewerReaction = reactionType;
				await createReactionNotification({
					authUser,
					targetAuthorUserId: post.author_user_id,
					targetKind: "stream post",
					streamPost: post,
					reactionType,
				});
			}

			if (!viewerReaction) {
				const updated = await StreamReaction.findOne({
					target_type: "post",
					target_id: postId,
					user_id: String(authUser.id),
				});
				viewerReaction = updated ? String(updated.reaction_type) : null;
			}

			const counts = await recomputeTargetReactionCounts({ targetType: "post", targetId: postId });
			await persistTargetReactionCounts({ targetType: "post", target: post, counts });

			return res.json({
				success: true,
				target_type: "post",
				target_id: postId,
				reaction_type: viewerReaction,
				reaction_counts: sanitizeReactionCounts(post.reaction_counts),
				post: serializePost(post, { viewerReaction }),
			});
		} catch (error) {
			console.error("Error reacting to stream post:", error);
			return res.status(500).json({ success: false, message: "Failed to update reaction" });
		}
	});

	router.put("/posts/:postId/replies/:replyId/reaction", ...requirePostInteract, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const postId = String(req.params.postId || "");
			const replyId = String(req.params.replyId || "");
			const reactionType = normalizeReactionType(req.body?.reaction_type || req.body?.reaction);

			const reply = await StreamReply.findOne({ id: replyId, post_id: postId });
			if (!reply) {
				return res.status(404).json({ success: false, message: "Stream reply not found" });
			}
			const post = await StreamPost.findOne({ id: postId });

			const existing = await StreamReaction.findOne({
				target_type: "reply",
				target_id: replyId,
				user_id: String(authUser.id),
			});

			let viewerReaction = null;

			if (!reactionType) {
				if (existing) await existing.deleteOne();
			} else if (!existing) {
				const actorName =
					[String(authUser.first_name), String(authUser.last_name)]
						.filter((value) => value && value !== "undefined")
						.join(" ")
						.trim() || authUser.username || authUser.email || "User";
				await new StreamReaction({
					id: uuidv4(),
					target_type: "reply",
					target_id: replyId,
					post_id: postId,
					reply_id: replyId,
					user_id: String(authUser.id),
					user_name: actorName,
					reaction_type: reactionType,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				}).save();
				viewerReaction = reactionType;
				await createReactionNotification({
					authUser,
					targetAuthorUserId: reply.author_user_id,
					targetKind: "reply",
					streamPost: post,
					streamReply: reply,
					reactionType,
				});
			} else if (String(existing.reaction_type) === reactionType) {
				await existing.deleteOne();
			} else {
				existing.reaction_type = reactionType;
				existing.updated_at = new Date().toISOString();
				await existing.save();
				viewerReaction = reactionType;
				await createReactionNotification({
					authUser,
					targetAuthorUserId: reply.author_user_id,
					targetKind: "reply",
					streamPost: post,
					streamReply: reply,
					reactionType,
				});
			}

			if (!viewerReaction) {
				const updated = await StreamReaction.findOne({
					target_type: "reply",
					target_id: replyId,
					user_id: String(authUser.id),
				});
				viewerReaction = updated ? String(updated.reaction_type) : null;
			}

			const counts = await recomputeTargetReactionCounts({ targetType: "reply", targetId: replyId });
			await persistTargetReactionCounts({ targetType: "reply", target: reply, counts });

			return res.json({
				success: true,
				target_type: "reply",
				target_id: replyId,
				reaction_type: viewerReaction,
				reaction_counts: sanitizeReactionCounts(reply.reaction_counts),
				reply: serializeReply(reply, { viewerReaction }),
			});
		} catch (error) {
			console.error("Error reacting to stream reply:", error);
			return res.status(500).json({ success: false, message: "Failed to update reaction" });
		}
	});

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

	router.get("/admin/reports", ...requireStreamModerate, async (req, res) => {
		try {
			const limitRaw = Number.parseInt(String(req.query.limit || "50"), 10);
			const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
			const activeReports = await StreamReport.find({
				status: { $in: ["open", "under_review"] },
			})
				.sort({ updated_at: -1, created_at: -1 })
				.limit(400);

			const reportCountsByPostId = new Map();
			const replyReportCountsByPostId = new Map();
			for (const report of activeReports) {
				const postId = String(report.post_id || "");
				if (!postId) continue;
				reportCountsByPostId.set(postId, Number(reportCountsByPostId.get(postId) || 0) + 1);
				if (String(report.target_type || "") === "reply") {
					replyReportCountsByPostId.set(
						postId,
						Number(replyReportCountsByPostId.get(postId) || 0) + 1
					);
				}
			}

			const posts = await StreamPost.find({ status: { $ne: "draft" } }).sort({ updated_at: -1 }).limit(250);

			const queue = posts
				.map((post) => {
					const metadata = post?.metadata && typeof post.metadata === "object" ? post.metadata : {};
					const reportCount = Number(
						reportCountsByPostId.get(String(post.id)) ??
						metadata.report_count ??
						metadata.reports ??
						0
					);
					const replyReportCount = Number(replyReportCountsByPostId.get(String(post.id)) || 0);
					const moderationStatus = String(metadata.moderation_status || "").toLowerCase();
					if (metadata && typeof metadata === "object") {
						metadata.report_count = reportCount;
						metadata.reply_report_count = replyReportCount;
					}
					return {
						post,
						reportCount,
						replyReportCount,
						moderationStatus,
					};
				})
				.filter(
					(item) =>
						item.reportCount > 0 ||
						item.moderationStatus === "review" ||
						item.moderationStatus === "restricted" ||
						item.moderationStatus === "blocked"
				)
				.sort((a, b) => {
					const scoreA =
						itemScore(a.reportCount, a.moderationStatus) +
						Number(a.replyReportCount || 0) * 2 +
						Number(a.post.reply_count || 0) +
						Number(a.post.like_count || 0);
					const scoreB =
						itemScore(b.reportCount, b.moderationStatus) +
						Number(b.replyReportCount || 0) * 2 +
						Number(b.post.reply_count || 0) +
						Number(b.post.like_count || 0);
					if (scoreB !== scoreA) return scoreB - scoreA;
					return getPostCreatedAt(b.post) - getPostCreatedAt(a.post);
				})
				.slice(0, limit)
				.map(({ post }) => serializePost(post));

			return res.json({
				success: true,
				reports: queue,
				count: queue.length,
				report_entries: activeReports.slice(0, Math.min(limit * 3, 150)).map(serializeReport),
			});
		} catch (error) {
			console.error("Error fetching stream moderation queue:", error);
			return res.status(500).json({ success: false, message: "Failed to fetch moderation queue" });
		}
	});

	router.get("/admin/posts/:id/audit", ...requireStreamModerate, async (req, res) => {
		try {
			const postId = String(req.params.id || "");
			const bundle = await loadStreamAuditBundle(postId);
			if (!bundle?.post) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}

			await syncPostReportSummary(bundle.post);
			for (const reply of bundle.replies) {
				await syncReplyReportSummary(reply);
			}

			const reports = bundle.reports.map(serializeReport);
			const actions = bundle.actions.map(serializeModerationAction);
			const replies = bundle.replies.map((reply) => serializeReply(reply));
			const pendingReports = reports.filter((report) => report.status !== "resolved");

			return res.json({
				success: true,
				post: serializePost(bundle.post),
				replies,
				reports,
				actions,
				summary: {
					report_count: pendingReports.length,
					reply_report_count: pendingReports.filter((report) => report.target_type === "reply").length,
					post_report_count: pendingReports.filter((report) => report.target_type === "post").length,
					action_count: actions.length,
					reply_count: replies.length,
				},
			});
		} catch (error) {
			console.error("Error loading stream audit bundle:", error);
			return res.status(500).json({ success: false, message: "Failed to load stream audit" });
		}
	});

	function itemScore(reportCount, moderationStatus) {
		const moderationWeight =
			moderationStatus === "blocked" ? 20 :
				moderationStatus === "restricted" ? 14 :
					moderationStatus === "review" ? 8 : 0;
		return Math.max(0, Number(reportCount || 0)) * 10 + moderationWeight;
	}

	router.patch("/admin/posts/:id/moderation", ...requireStreamModerate, async (req, res) => {
		try {
			const postId = String(req.params.id || "");
			const action = String(req.body?.action || req.body?.status || "").trim().toLowerCase();
			const note = String(req.body?.note || "").trim().slice(0, 500);
			const clearReports = Boolean(req.body?.clear_reports ?? req.body?.clearReports);
			const authUser = req.auth.user;

			const post = await StreamPost.findOne({ id: postId });
			if (!post) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}

			const metadata = ensureMetadataObject(post);
			const now = new Date().toISOString();
			const actionMap = {
				review: "review",
				restrict: "restricted",
				restricted: "restricted",
				block: "blocked",
				blocked: "blocked",
				clear: "",
				restore: "",
				approve: "",
			};

			if (!Object.prototype.hasOwnProperty.call(actionMap, action)) {
				return res.status(400).json({ success: false, message: "Invalid moderation action" });
			}

			const nextStatus = actionMap[action];
			if (nextStatus) metadata.moderation_status = nextStatus;
			else delete metadata.moderation_status;

			if (clearReports || action === "clear" || action === "approve" || action === "restore") {
				metadata.report_count = 0;
				metadata.report_events = [];
			}

			const actionHistory = Array.isArray(metadata.moderation_actions) ? [...metadata.moderation_actions] : [];
			actionHistory.push({
				id: uuidv4(),
				action,
				status: nextStatus || "clear",
				note,
				actor_user_id: String(authUser.id || ""),
				actor_name:
					[String(authUser.first_name), String(authUser.last_name)]
						.filter((value) => value && value !== "undefined")
						.join(" ")
						.trim() || authUser.username || authUser.email || "Admin",
				created_at: now,
			});
			metadata.moderation_actions = actionHistory.slice(-50);
			metadata.moderation_updated_at = now;
			metadata.moderation_updated_by = String(authUser.id || "");
			metadata.moderation_updated_by_name = getAuthDisplayName(authUser, "Admin");

			if (clearReports || action === "clear" || action === "approve" || action === "restore") {
				await markReportsForTarget({
					targetType: "post",
					targetId: postId,
					authUser,
					status: "resolved",
				});
			} else if (action === "review" || action === "restrict" || action === "restricted" || action === "block" || action === "blocked") {
				await markReportsForTarget({
					targetType: "post",
					targetId: postId,
					authUser,
					status: "under_review",
				});
			}

			const actionRecord = await createModerationActionRecord({
				targetType: "post",
				targetId: postId,
				postId,
				actionScope: "moderation",
				action,
				status: nextStatus || "clear",
				note,
				authUser,
				metadata: {
					clear_reports: clearReports,
				},
			});

			await syncPostReportSummary(post);
			post.updated_at = now;
			await post.save();

			return res.json({
				success: true,
				message: "Moderation updated",
				post: serializePost(post),
				action: serializeModerationAction(actionRecord),
			});
		} catch (error) {
			console.error("Error updating stream moderation:", error);
			return res.status(500).json({ success: false, message: "Failed to update moderation" });
		}
	});

	router.patch("/admin/replies/:replyId/moderation", ...requireStreamModerate, async (req, res) => {
		try {
			const replyId = String(req.params.replyId || "");
			const action = String(req.body?.action || req.body?.status || "").trim().toLowerCase();
			const note = String(req.body?.note || "").trim().slice(0, 500);
			const clearReports = Boolean(req.body?.clear_reports ?? req.body?.clearReports);
			const authUser = req.auth.user;

			const reply = await StreamReply.findOne({ id: replyId });
			if (!reply) {
				return res.status(404).json({ success: false, message: "Stream reply not found" });
			}
			const postId = String(reply.post_id || req.body?.post_id || "");
			const post = postId ? await StreamPost.findOne({ id: postId }) : null;

			const metadata = ensureMetadataObject(reply);
			const now = new Date().toISOString();
			const actionMap = {
				review: "review",
				restrict: "restricted",
				restricted: "restricted",
				block: "blocked",
				blocked: "blocked",
				clear: "",
				restore: "",
				approve: "",
			};

			if (!Object.prototype.hasOwnProperty.call(actionMap, action)) {
				return res.status(400).json({ success: false, message: "Invalid moderation action" });
			}

			const nextStatus = actionMap[action];
			if (nextStatus) metadata.moderation_status = nextStatus;
			else delete metadata.moderation_status;

			if (action === "block" || action === "blocked") {
				reply.status = "blocked";
			} else if (action === "restrict" || action === "restricted") {
				reply.status = "restricted";
			} else if (action === "clear" || action === "restore" || action === "approve") {
				reply.status = "published";
			}

			if (clearReports || action === "clear" || action === "approve" || action === "restore") {
				await markReportsForTarget({
					targetType: "reply",
					targetId: replyId,
					authUser,
					status: "resolved",
				});
			} else if (action === "review" || action === "restrict" || action === "restricted" || action === "block" || action === "blocked") {
				await markReportsForTarget({
					targetType: "reply",
					targetId: replyId,
					authUser,
					status: "under_review",
				});
			}

			const actionRecord = await createModerationActionRecord({
				targetType: "reply",
				targetId: replyId,
				postId,
				replyId,
				actionScope: "moderation",
				action,
				status: nextStatus || "clear",
				note,
				authUser,
				metadata: {
					clear_reports: clearReports,
				},
			});

			const actionHistory = Array.isArray(metadata.moderation_actions) ? [...metadata.moderation_actions] : [];
			actionHistory.push({
				id: actionRecord.id,
				action,
				status: nextStatus || "clear",
				note,
				actor_user_id: String(authUser.id || ""),
				actor_name: getAuthDisplayName(authUser, "Admin"),
				created_at: now,
			});
			metadata.moderation_actions = actionHistory.slice(-50);
			metadata.moderation_updated_at = now;
			metadata.moderation_updated_by = String(authUser.id || "");

			await syncReplyReportSummary(reply);
			reply.updated_at = now;
			await reply.save();

			if (post) {
				const publishedReplyCount = await StreamReply.countDocuments({
					post_id: String(post.id),
					status: "published",
				});
				post.reply_count = Math.max(0, Number(publishedReplyCount || 0));
				post.updated_at = now;
				await syncPostReportSummary(post);
				await post.save();
			}

			return res.json({
				success: true,
				message: "Reply moderation updated",
				reply: serializeReply(reply),
				post: post ? serializePost(post) : null,
				action: serializeModerationAction(actionRecord),
			});
		} catch (error) {
			console.error("Error updating stream reply moderation:", error);
			return res.status(500).json({ success: false, message: "Failed to update reply moderation" });
		}
	});

	router.patch("/admin/posts/:id/feature", ...requireStreamFeature, async (req, res) => {
		try {
			const postId = String(req.params.id || "");
			const authUser = req.auth.user;
			const featured = Boolean(req.body?.featured);
			const editorialBoostRaw = req.body?.editorial_boost ?? req.body?.editorialBoost;
			const editorialBoost = Number.isFinite(Number(editorialBoostRaw))
				? Math.max(0, Math.min(10, Number(editorialBoostRaw)))
				: undefined;

			const post = await StreamPost.findOne({ id: postId });
			if (!post) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}

			const metadata = ensureMetadataObject(post);
			const now = new Date().toISOString();
			metadata.is_featured = featured;
			metadata.featured = featured;
			if (editorialBoost !== undefined) {
				metadata.editorial_boost = editorialBoost;
			} else if (!featured) {
				metadata.editorial_boost = 0;
			}
			metadata.featured_updated_at = now;
			metadata.featured_updated_by = String(authUser.id || "");
			post.updated_at = now;
			const actionRecord = await createModerationActionRecord({
				targetType: "post",
				targetId: postId,
				postId,
				actionScope: "feature",
				action: featured ? "feature" : "unfeature",
				status: featured ? "featured" : "standard",
				note: "",
				authUser,
				metadata: {
					editorial_boost: Number(metadata.editorial_boost || 0),
				},
			});
			await post.save();

			return res.json({
				success: true,
				message: featured ? "Post featured" : "Post removed from featured",
				post: serializePost(post),
				action: serializeModerationAction(actionRecord),
			});
		} catch (error) {
			console.error("Error updating stream feature state:", error);
			return res.status(500).json({ success: false, message: "Failed to update feature state" });
		}
	});

	return router;
}

module.exports = createStreamRoutes;
