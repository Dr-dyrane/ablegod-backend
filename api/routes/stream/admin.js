const { v4: uuidv4 } = require("uuid");
const {
    StreamPost, StreamReply, StreamReport, StreamCircle,
    serializePost, serializeReply, serializeReport, serializeModerationAction,
    ensureMetadataObject, getAuthDisplayName,
    syncPostReportSummary, syncReplyReportSummary,
    upsertStreamReport, markReportsForTarget,
    createModerationActionRecord, loadStreamAuditBundle,
    getPostCreatedAt,
} = require("./_helpers");
const ChatMessage = require("../../models/chatMessage");
const ChatConversation = require("../../models/chatConversation");

function itemScore(reportCount, moderationStatus) {
    const moderationWeight =
        moderationStatus === "blocked" ? 20 :
            moderationStatus === "restricted" ? 14 :
                moderationStatus === "review" ? 8 : 0;
    return Math.max(0, Number(reportCount || 0)) * 10 + moderationWeight;
}

async function syncChatMessageReportSummary(message) {
    if (!message) return message;
    const metadata = ensureMetadataObject(message);
    const activeReports = await StreamReport.find({
        target_type: "chat_message",
        target_id: String(message.id || ""),
        status: { $in: ["open", "under_review"] },
    })
        .sort({ updated_at: -1, created_at: -1 })
        .limit(50);
    metadata.report_events = activeReports.map((report) => ({
        id: String(report.id || ""),
        user_id: String(report.reporter_user_id || ""),
        user_name: String(report.reporter_name || "Member"),
        reason: String(report.reason || "other"),
        note: String(report.note || ""),
        status: String(report.status || "open"),
        created_at: report.created_at,
        updated_at: report.updated_at || report.created_at,
        target_type: "chat_message",
        target_id: String(report.target_id || message.id || ""),
    }));
    metadata.report_count = metadata.report_events.length;
    if (!metadata.report_count && String(metadata.moderation_status || "").toLowerCase() === "review") {
        delete metadata.moderation_status;
    }
    return message;
}

function serializeChatMessageModeration(message, conversation = null) {
    const metadata = message?.metadata && typeof message.metadata === "object" ? message.metadata : {};
    return {
        id: String(message?.id || ""),
        conversation_id: String(message?.conversation_id || ""),
        conversation_name: String(conversation?.name || ""),
        conversation_type: String(conversation?.type || ""),
        sender_id: String(message?.sender_id || ""),
        content_type: String(message?.content_type || "text"),
        content_preview: String(
            message?.content ||
            metadata.content_preview ||
            "Encrypted message"
        ).slice(0, 180),
        created_at: message?.created_at,
        deleted_at: message?.deleted_at || null,
        moderation_status: String(metadata.moderation_status || ""),
        report_count: Number(metadata.report_count || 0),
        metadata,
    };
}

function mountAdminRoutes(router, { requireStreamModerate, requireStreamFeature, requirePostInteract }) {

    // ─── POST /posts/:id/report ───
    router.post("/posts/:id/report", ...requirePostInteract, async (req, res) => {
        try {
            const authUser = req.auth.user;
            const postId = String(req.params.id || "");
            const reason = String(req.body?.reason || "other").trim().slice(0, 80) || "other";
            const note = String(req.body?.note || "").trim().slice(0, 500);
            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });
            const now = new Date().toISOString();
            await upsertStreamReport({
                targetType: "post", targetId: postId, postId,
                reportedUserId: String(post.author_user_id || ""), authUser, reason, note,
            });
            const metadata = ensureMetadataObject(post);
            if (!metadata.moderation_status) metadata.moderation_status = "review";
            post.updated_at = now;
            await syncPostReportSummary(post);
            await post.save();
            return res.status(201).json({
                success: true, message: "Report submitted", post: serializePost(post),
                report_count: Number(metadata.report_count || 0),
                moderation_status: String(metadata.moderation_status || ""),
            });
        } catch (error) {
            console.error("Error reporting stream post:", error);
            return res.status(500).json({ success: false, message: "Failed to submit report" });
        }
    });

    // ─── POST /posts/:postId/replies/:replyId/report ───
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
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });
            if (!reply) return res.status(404).json({ success: false, message: "Stream reply not found" });
            const now = new Date().toISOString();
            await upsertStreamReport({
                targetType: "reply", targetId: replyId, postId, replyId,
                reportedUserId: String(reply.author_user_id || ""), authUser, reason, note,
            });
            const replyMetadata = ensureMetadataObject(reply);
            if (!replyMetadata.moderation_status) replyMetadata.moderation_status = "review";
            reply.updated_at = now;
            await syncReplyReportSummary(reply);
            await reply.save();
            return res.status(201).json({
                success: true, message: "Reply report submitted", reply: serializeReply(reply),
                report_count: Number(reply.metadata?.report_count || 0),
                moderation_status: String(reply.metadata?.moderation_status || ""),
            });
        } catch (error) {
            console.error("Error reporting stream reply:", error);
            return res.status(500).json({ success: false, message: "Failed to submit reply report" });
        }
    });

    // ─── GET /admin/reports ───
    router.get("/admin/reports", ...requireStreamModerate, async (req, res) => {
        try {
            const limitRaw = Number.parseInt(String(req.query.limit || "50"), 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
            const activeReports = await StreamReport.find({
                status: { $in: ["open", "under_review"] },
            }).sort({ updated_at: -1, created_at: -1 }).limit(400);
            const circleReports = activeReports.filter(
                (report) => String(report.target_type || "") === "circle"
            );
            const chatReports = activeReports.filter(
                (report) => String(report.target_type || "") === "chat_message"
            );

            const reportCountsByPostId = new Map();
            const replyReportCountsByPostId = new Map();
            for (const report of activeReports) {
                const postId = String(report.post_id || "");
                if (!postId) continue;
                reportCountsByPostId.set(postId, Number(reportCountsByPostId.get(postId) || 0) + 1);
                if (String(report.target_type || "") === "reply") {
                    replyReportCountsByPostId.set(postId, Number(replyReportCountsByPostId.get(postId) || 0) + 1);
                }
            }

            const posts = await StreamPost.find({ status: { $ne: "draft" } }).sort({ updated_at: -1 }).limit(250);
            const queue = posts
                .map((post) => {
                    const metadata = post?.metadata && typeof post.metadata === "object" ? post.metadata : {};
                    const reportCount = Number(reportCountsByPostId.get(String(post.id)) ?? metadata.report_count ?? metadata.reports ?? 0);
                    const replyReportCount = Number(replyReportCountsByPostId.get(String(post.id)) || 0);
                    const moderationStatus = String(metadata.moderation_status || "").toLowerCase();
                    if (metadata && typeof metadata === "object") {
                        metadata.report_count = reportCount;
                        metadata.reply_report_count = replyReportCount;
                    }
                    return { post, reportCount, replyReportCount, moderationStatus };
                })
                .filter((item) =>
                    item.reportCount > 0 ||
                    item.moderationStatus === "review" ||
                    item.moderationStatus === "restricted" ||
                    item.moderationStatus === "blocked"
                )
                .sort((a, b) => {
                    const scoreA = itemScore(a.reportCount, a.moderationStatus) + Number(a.replyReportCount || 0) * 2 + Number(a.post.reply_count || 0) + Number(a.post.like_count || 0);
                    const scoreB = itemScore(b.reportCount, b.moderationStatus) + Number(b.replyReportCount || 0) * 2 + Number(b.post.reply_count || 0) + Number(b.post.like_count || 0);
                    if (scoreB !== scoreA) return scoreB - scoreA;
                    return getPostCreatedAt(b.post) - getPostCreatedAt(a.post);
                })
                .slice(0, limit)
                .map(({ post }) => serializePost(post));

            const circleIds = Array.from(
                new Set(
                    circleReports
                        .map((report) => String(report.target_id || ""))
                        .filter(Boolean)
                )
            );
            const circles = circleIds.length
                ? await StreamCircle.find({ id: { $in: circleIds } }).limit(limit * 2)
                : [];
            const circleMap = new Map(circles.map((circle) => [String(circle.id || ""), circle]));
            const circleReportCountById = new Map();
            for (const report of circleReports) {
                const circleId = String(report.target_id || "");
                if (!circleId) continue;
                circleReportCountById.set(circleId, Number(circleReportCountById.get(circleId) || 0) + 1);
            }
            const circleQueue = Array.from(circleReportCountById.entries())
                .map(([circleId, count]) => {
                    const circle = circleMap.get(circleId);
                    const latestReport = circleReports.find((report) => String(report.target_id || "") === circleId);
                    return {
                        id: circleId,
                        report_count: Number(count || 0),
                        latest_report_at: latestReport?.updated_at || latestReport?.created_at || null,
                        circle: circle
                            ? {
                                id: String(circle.id || ""),
                                slug: String(circle.slug || ""),
                                name: String(circle.name || ""),
                                visibility: String(circle.visibility || "public"),
                                owner_user_id: String(circle.owner_user_id || ""),
                                owner_name: String(circle.owner_name || ""),
                                member_count: Number(circle.member_count || 0),
                                post_count: Number(circle.post_count || 0),
                                updated_at: circle.updated_at,
                                metadata: circle.metadata && typeof circle.metadata === "object" ? circle.metadata : {},
                            }
                            : null,
                    };
                })
                .sort((a, b) => Number(b.report_count || 0) - Number(a.report_count || 0))
                .slice(0, limit);

            const chatMessageIds = Array.from(
                new Set(
                    chatReports
                        .map((report) => String(report.target_id || ""))
                        .filter(Boolean)
                )
            );
            const chatMessages = chatMessageIds.length
                ? await ChatMessage.find({ id: { $in: chatMessageIds } }).limit(limit * 4)
                : [];
            const chatMessageMap = new Map(
                chatMessages.map((message) => [String(message.id || ""), message])
            );
            const chatConversationIds = Array.from(
                new Set(
                    chatMessages
                        .map((message) => String(message.conversation_id || ""))
                        .filter(Boolean)
                )
            );
            const chatConversations = chatConversationIds.length
                ? await ChatConversation.find({ id: { $in: chatConversationIds } }).limit(limit * 2)
                : [];
            const conversationMap = new Map(
                chatConversations.map((conversation) => [String(conversation.id || ""), conversation])
            );
            const chatReportCountById = new Map();
            const latestChatReportById = new Map();
            for (const report of chatReports) {
                const messageId = String(report.target_id || "");
                if (!messageId) continue;
                chatReportCountById.set(messageId, Number(chatReportCountById.get(messageId) || 0) + 1);
                const existing = latestChatReportById.get(messageId);
                const existingTimestamp = new Date(existing?.updated_at || existing?.created_at || 0).getTime();
                const nextTimestamp = new Date(report.updated_at || report.created_at || 0).getTime();
                if (!existing || nextTimestamp >= existingTimestamp) {
                    latestChatReportById.set(messageId, report);
                }
            }
            const chatQueue = Array.from(chatReportCountById.entries())
                .map(([messageId, count]) => {
                    const message = chatMessageMap.get(messageId);
                    const conversation = message
                        ? conversationMap.get(String(message.conversation_id || ""))
                        : null;
                    const latestReport = latestChatReportById.get(messageId);
                    return {
                        id: messageId,
                        report_count: Number(count || 0),
                        latest_report_at: latestReport?.updated_at || latestReport?.created_at || null,
                        message: message ? serializeChatMessageModeration(message, conversation) : null,
                        latest_report: latestReport ? serializeReport(latestReport) : null,
                    };
                })
                .sort((a, b) => {
                    const countDiff = Number(b.report_count || 0) - Number(a.report_count || 0);
                    if (countDiff !== 0) return countDiff;
                    const timeA = new Date(a.latest_report_at || 0).getTime();
                    const timeB = new Date(b.latest_report_at || 0).getTime();
                    return timeB - timeA;
                })
                .slice(0, limit);

            return res.json({
                success: true, reports: queue, count: queue.length,
                report_entries: activeReports.slice(0, Math.min(limit * 3, 150)).map(serializeReport),
                circle_reports: circleQueue,
                chat_reports: chatQueue,
            });
        } catch (error) {
            console.error("Error fetching stream moderation queue:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch moderation queue" });
        }
    });

    // ─── GET /admin/posts/:id/audit ───
    router.get("/admin/posts/:id/audit", ...requireStreamModerate, async (req, res) => {
        try {
            const postId = String(req.params.id || "");
            const bundle = await loadStreamAuditBundle(postId);
            if (!bundle?.post) return res.status(404).json({ success: false, message: "Stream post not found" });
            await syncPostReportSummary(bundle.post);
            for (const reply of bundle.replies) await syncReplyReportSummary(reply);
            const reports = bundle.reports.map(serializeReport);
            const actions = bundle.actions.map(serializeModerationAction);
            const replies = bundle.replies.map((reply) => serializeReply(reply));
            const pendingReports = reports.filter((report) => report.status !== "resolved");
            return res.json({
                success: true,
                post: serializePost(bundle.post), replies, reports, actions,
                summary: {
                    report_count: pendingReports.length,
                    reply_report_count: pendingReports.filter((r) => r.target_type === "reply").length,
                    post_report_count: pendingReports.filter((r) => r.target_type === "post").length,
                    action_count: actions.length, reply_count: replies.length,
                },
            });
        } catch (error) {
            console.error("Error loading stream audit bundle:", error);
            return res.status(500).json({ success: false, message: "Failed to load stream audit" });
        }
    });

    // ─── PATCH /admin/posts/:id/moderation ───
    router.patch("/admin/posts/:id/moderation", ...requireStreamModerate, async (req, res) => {
        try {
            const postId = String(req.params.id || "");
            const action = String(req.body?.action || req.body?.status || "").trim().toLowerCase();
            const note = String(req.body?.note || "").trim().slice(0, 500);
            const clearReports = Boolean(req.body?.clear_reports ?? req.body?.clearReports);
            const authUser = req.auth.user;
            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });
            const metadata = ensureMetadataObject(post);
            const now = new Date().toISOString();
            const actionMap = {
                review: "review", restrict: "restricted", restricted: "restricted",
                block: "blocked", blocked: "blocked", clear: "", restore: "", approve: "",
            };
            if (!Object.prototype.hasOwnProperty.call(actionMap, action)) {
                return res.status(400).json({ success: false, message: "Invalid moderation action" });
            }
            const nextStatus = actionMap[action];
            if (nextStatus) metadata.moderation_status = nextStatus;
            else delete metadata.moderation_status;
            if (clearReports || action === "clear" || action === "approve" || action === "restore") {
                metadata.report_count = 0; metadata.report_events = [];
            }
            const actionHistory = Array.isArray(metadata.moderation_actions) ? [...metadata.moderation_actions] : [];
            actionHistory.push({
                id: uuidv4(), action, status: nextStatus || "clear", note,
                actor_user_id: String(authUser.id || ""), actor_name: getAuthDisplayName(authUser, "Admin"),
                created_at: now,
            });
            metadata.moderation_actions = actionHistory.slice(-50);
            metadata.moderation_updated_at = now;
            metadata.moderation_updated_by = String(authUser.id || "");
            metadata.moderation_updated_by_name = getAuthDisplayName(authUser, "Admin");

            if (clearReports || action === "clear" || action === "approve" || action === "restore") {
                await markReportsForTarget({ targetType: "post", targetId: postId, authUser, status: "resolved" });
            } else if (["review", "restrict", "restricted", "block", "blocked"].includes(action)) {
                await markReportsForTarget({ targetType: "post", targetId: postId, authUser, status: "under_review" });
            }

            const actionRecord = await createModerationActionRecord({
                targetType: "post", targetId: postId, postId, actionScope: "moderation",
                action, status: nextStatus || "clear", note, authUser,
                metadata: { clear_reports: clearReports },
            });
            await syncPostReportSummary(post);
            post.updated_at = now;
            await post.save();
            return res.json({
                success: true, message: "Moderation updated",
                post: serializePost(post), action: serializeModerationAction(actionRecord),
            });
        } catch (error) {
            console.error("Error updating stream moderation:", error);
            return res.status(500).json({ success: false, message: "Failed to update moderation" });
        }
    });

    // ─── PATCH /admin/replies/:replyId/moderation ───
    router.patch("/admin/replies/:replyId/moderation", ...requireStreamModerate, async (req, res) => {
        try {
            const replyId = String(req.params.replyId || "");
            const action = String(req.body?.action || req.body?.status || "").trim().toLowerCase();
            const note = String(req.body?.note || "").trim().slice(0, 500);
            const clearReports = Boolean(req.body?.clear_reports ?? req.body?.clearReports);
            const authUser = req.auth.user;
            const reply = await StreamReply.findOne({ id: replyId });
            if (!reply) return res.status(404).json({ success: false, message: "Stream reply not found" });
            const postId = String(reply.post_id || req.body?.post_id || "");
            const post = postId ? await StreamPost.findOne({ id: postId }) : null;
            const metadata = ensureMetadataObject(reply);
            const now = new Date().toISOString();
            const actionMap = {
                review: "review", restrict: "restricted", restricted: "restricted",
                block: "blocked", blocked: "blocked", clear: "", restore: "", approve: "",
            };
            if (!Object.prototype.hasOwnProperty.call(actionMap, action)) {
                return res.status(400).json({ success: false, message: "Invalid moderation action" });
            }
            const nextStatus = actionMap[action];
            if (nextStatus) metadata.moderation_status = nextStatus;
            else delete metadata.moderation_status;
            if (action === "block" || action === "blocked") reply.status = "blocked";
            else if (action === "restrict" || action === "restricted") reply.status = "restricted";
            else if (action === "clear" || action === "restore" || action === "approve") reply.status = "published";

            if (clearReports || action === "clear" || action === "approve" || action === "restore") {
                await markReportsForTarget({ targetType: "reply", targetId: replyId, authUser, status: "resolved" });
            } else if (["review", "restrict", "restricted", "block", "blocked"].includes(action)) {
                await markReportsForTarget({ targetType: "reply", targetId: replyId, authUser, status: "under_review" });
            }

            const actionRecord = await createModerationActionRecord({
                targetType: "reply", targetId: replyId, postId, replyId,
                actionScope: "moderation", action, status: nextStatus || "clear", note, authUser,
                metadata: { clear_reports: clearReports },
            });
            const actionHistory = Array.isArray(metadata.moderation_actions) ? [...metadata.moderation_actions] : [];
            actionHistory.push({
                id: actionRecord.id, action, status: nextStatus || "clear", note,
                actor_user_id: String(authUser.id || ""), actor_name: getAuthDisplayName(authUser, "Admin"),
                created_at: now,
            });
            metadata.moderation_actions = actionHistory.slice(-50);
            metadata.moderation_updated_at = now;
            metadata.moderation_updated_by = String(authUser.id || "");

            await syncReplyReportSummary(reply);
            reply.updated_at = now;
            await reply.save();
            if (post) {
                const publishedReplyCount = await StreamReply.countDocuments({ post_id: String(post.id), status: "published" });
                post.reply_count = Math.max(0, Number(publishedReplyCount || 0));
                post.updated_at = now;
                await syncPostReportSummary(post);
                await post.save();
            }
            return res.json({
                success: true, message: "Reply moderation updated",
                reply: serializeReply(reply), post: post ? serializePost(post) : null,
                action: serializeModerationAction(actionRecord),
            });
        } catch (error) {
            console.error("Error updating stream reply moderation:", error);
            return res.status(500).json({ success: false, message: "Failed to update reply moderation" });
        }
    });

    // ─── PATCH /admin/posts/:id/feature ───
    // ─── PATCH /admin/chat/messages/:messageId/moderation ───
    router.patch("/admin/chat/messages/:messageId/moderation", ...requireStreamModerate, async (req, res) => {
        try {
            const messageId = String(req.params.messageId || "");
            const action = String(req.body?.action || req.body?.status || "").trim().toLowerCase();
            const note = String(req.body?.note || "").trim().slice(0, 500);
            const clearReports = Boolean(req.body?.clear_reports ?? req.body?.clearReports);
            const authUser = req.auth.user;
            const chatMessage = await ChatMessage.findOne({ id: messageId });
            if (!chatMessage) return res.status(404).json({ success: false, message: "Chat message not found" });
            const metadata = ensureMetadataObject(chatMessage);
            const now = new Date().toISOString();
            const actionMap = {
                review: "review", restrict: "restricted", restricted: "restricted",
                block: "blocked", blocked: "blocked", clear: "", restore: "", approve: "",
            };
            if (!Object.prototype.hasOwnProperty.call(actionMap, action)) {
                return res.status(400).json({ success: false, message: "Invalid moderation action" });
            }
            const nextStatus = actionMap[action];
            if (nextStatus) metadata.moderation_status = nextStatus;
            else delete metadata.moderation_status;

            if (action === "block" || action === "blocked") {
                chatMessage.deleted_at = now;
            } else if (action === "clear" || action === "restore" || action === "approve") {
                chatMessage.deleted_at = null;
            }

            if (clearReports || action === "clear" || action === "approve" || action === "restore") {
                await markReportsForTarget({
                    targetType: "chat_message",
                    targetId: messageId,
                    authUser,
                    status: "resolved",
                });
            } else if (["review", "restrict", "restricted", "block", "blocked"].includes(action)) {
                await markReportsForTarget({
                    targetType: "chat_message",
                    targetId: messageId,
                    authUser,
                    status: "under_review",
                });
            }

            const actionRecord = await createModerationActionRecord({
                targetType: "chat_message",
                targetId: messageId,
                postId: `chat:${String(chatMessage.conversation_id || "")}`,
                actionScope: "moderation",
                action,
                status: nextStatus || "clear",
                note,
                authUser,
                metadata: {
                    clear_reports: clearReports,
                    conversation_id: String(chatMessage.conversation_id || ""),
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
            metadata.moderation_updated_by_name = getAuthDisplayName(authUser, "Admin");

            await syncChatMessageReportSummary(chatMessage);
            await chatMessage.save();
            const conversation = await ChatConversation.findOne({
                id: String(chatMessage.conversation_id || ""),
            });
            return res.json({
                success: true,
                message: "Chat message moderation updated",
                chat_message: serializeChatMessageModeration(chatMessage, conversation),
                action: serializeModerationAction(actionRecord),
            });
        } catch (error) {
            console.error("Error updating chat message moderation:", error);
            return res.status(500).json({ success: false, message: "Failed to update chat moderation" });
        }
    });

    router.patch("/admin/posts/:id/feature", ...requireStreamFeature, async (req, res) => {
        try {
            const postId = String(req.params.id || "");
            const authUser = req.auth.user;
            const featured = Boolean(req.body?.featured);
            const editorialBoostRaw = req.body?.editorial_boost ?? req.body?.editorialBoost;
            const editorialBoost = Number.isFinite(Number(editorialBoostRaw))
                ? Math.max(0, Math.min(10, Number(editorialBoostRaw))) : undefined;
            const post = await StreamPost.findOne({ id: postId });
            if (!post) return res.status(404).json({ success: false, message: "Stream post not found" });
            const metadata = ensureMetadataObject(post);
            const now = new Date().toISOString();
            metadata.is_featured = featured;
            metadata.featured = featured;
            if (editorialBoost !== undefined) metadata.editorial_boost = editorialBoost;
            else if (!featured) metadata.editorial_boost = 0;
            metadata.featured_updated_at = now;
            metadata.featured_updated_by = String(authUser.id || "");
            post.updated_at = now;
            const actionRecord = await createModerationActionRecord({
                targetType: "post", targetId: postId, postId,
                actionScope: "feature", action: featured ? "feature" : "unfeature",
                status: featured ? "featured" : "standard", note: "", authUser,
                metadata: { editorial_boost: Number(metadata.editorial_boost || 0) },
            });
            await post.save();
            return res.json({
                success: true, message: featured ? "Post featured" : "Post removed from featured",
                post: serializePost(post), action: serializeModerationAction(actionRecord),
            });
        } catch (error) {
            console.error("Error updating stream feature state:", error);
            return res.status(500).json({ success: false, message: "Failed to update feature state" });
        }
    });
}

module.exports = mountAdminRoutes;
