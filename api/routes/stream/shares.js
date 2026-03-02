const { randomBytes } = require("crypto");
const { v4: uuidv4 } = require("uuid");
const {
	StreamPost,
	StreamReply,
	StreamShare,
	getAuthDisplayName,
} = require("./_helpers");

function sanitizeText(value, maxLength = 256) {
	const normalized = String(value || "")
		.replace(/[\u0000-\u001F\u007F]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (!normalized) return "";
	return normalized.length <= maxLength
		? normalized
		: `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function sanitizeUrl(value) {
	const normalized = sanitizeText(value, 2048);
	if (!/^https?:\/\//i.test(normalized)) return "";
	return normalized;
}

function isPublishedStreamPost(post) {
	return String(post?.status || "published").toLowerCase() === "published";
}

function serializeShareRecord({ share, post, reply }) {
	const fallbackAuthor = sanitizeText(
		reply?.author_name || post?.author_name || "AbleGod Member",
		60
	);
	const fallbackTitle = reply
		? sanitizeText(`Reply to: ${post?.title || "Stream reflection"}`, 110)
		: sanitizeText(
				post?.title || `${fallbackAuthor || "AbleGod Member"} on AbleGod Stream`,
				110
		  );
	const fallbackExcerpt = sanitizeText(
		reply?.content || post?.excerpt || post?.content || "A faith reflection from AbleGod Stream.",
		220
	);
	const fallbackIntent = sanitizeText(
		reply ? "Reply" : post?.intent || "Reflection",
		40
	);
	const fallbackCreatedAt = sanitizeText(
		reply?.created_at || post?.created_at || "",
		64
	);

	return {
		id: String(share?.id || ""),
		post_id: String(post?.id || share?.post_id || ""),
		reply_id: share?.reply_id ? String(share.reply_id) : null,
		snapshot_url:
			sanitizeUrl(share?.snapshot_url) ||
			sanitizeUrl(post?.metadata?.share_snapshot_url) ||
			"",
		title: sanitizeText(share?.title, 110) || fallbackTitle,
		excerpt: sanitizeText(share?.excerpt, 220) || fallbackExcerpt,
		author_name: sanitizeText(share?.author_name, 60) || fallbackAuthor,
		intent: sanitizeText(share?.intent, 40) || fallbackIntent,
		created_at:
			sanitizeText(share?.shared_post_created_at, 64) || fallbackCreatedAt,
		url_path: `/s/${encodeURIComponent(String(share?.id || ""))}`,
	};
}

async function generateUniqueShareId() {
	for (let attempt = 0; attempt < 6; attempt += 1) {
		const candidate = randomBytes(6)
			.toString("base64url")
			.replace(/[^a-zA-Z0-9_-]/g, "")
			.slice(0, 10);
		if (!candidate) continue;
		// eslint-disable-next-line no-await-in-loop
		const exists = await StreamShare.findOne({ id: candidate }, { id: 1 });
		if (!exists) return candidate;
	}
	return uuidv4();
}

function mountShareRoutes(router, { requirePostInteract }) {
	router.get("/public/posts/:id/share-meta", async (req, res) => {
		try {
			const postId = sanitizeText(req.params.id, 128);
			if (!postId) {
				return res.status(400).json({ success: false, message: "Post id is required" });
			}

			const post = await StreamPost.findOne({ id: postId });
			if (!post || !isPublishedStreamPost(post)) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}

			const latestShareWithSnapshot = await StreamShare.findOne({
				post_id: String(post.id),
				status: "active",
				snapshot_url: { $exists: true, $ne: "" },
			}).sort({ updated_at: -1, created_at: -1 });

			const payload = serializeShareRecord({
				share: latestShareWithSnapshot || {},
				post,
				reply: null,
			});

			return res.json({
				success: true,
				post: {
					id: payload.post_id,
					title: payload.title,
					excerpt: payload.excerpt,
					content: sanitizeText(post.content, 300),
					author_name: payload.author_name,
					intent: payload.intent,
					created_at: payload.created_at,
					snapshot_url: payload.snapshot_url,
				},
			});
		} catch (error) {
			console.error("Error loading public stream share meta:", error);
			return res.status(500).json({ success: false, message: "Failed to load stream share metadata" });
		}
	});

	router.get("/public/shares/:id", async (req, res) => {
		try {
			const shareId = sanitizeText(req.params.id, 128);
			if (!shareId) {
				return res.status(400).json({ success: false, message: "Share id is required" });
			}

			const share = await StreamShare.findOne({ id: shareId, status: "active" });
			if (!share) {
				return res.status(404).json({ success: false, message: "Share not found" });
			}

			const post = await StreamPost.findOne({ id: String(share.post_id || "") });
			if (!post || !isPublishedStreamPost(post)) {
				return res.status(404).json({ success: false, message: "Shared stream post not found" });
			}

			let reply = null;
			if (share.reply_id) {
				reply = await StreamReply.findOne({
					id: String(share.reply_id),
					post_id: String(post.id),
					status: "published",
				});
			}

			return res.json({
				success: true,
				share: serializeShareRecord({ share, post, reply }),
			});
		} catch (error) {
			console.error("Error loading public stream share record:", error);
			return res.status(500).json({ success: false, message: "Failed to load stream share" });
		}
	});

	router.post("/shares", ...requirePostInteract, async (req, res) => {
		try {
			const authUser = req.auth?.user;
			const postId = sanitizeText(req.body?.post_id || req.body?.postId, 128);
			const replyId = sanitizeText(req.body?.reply_id || req.body?.replyId, 128);
			const snapshotUrl = sanitizeUrl(req.body?.snapshot_url || req.body?.snapshotUrl);

			if (!postId) {
				return res.status(400).json({ success: false, message: "post_id is required" });
			}

			const post = await StreamPost.findOne({ id: postId });
			if (!post || !isPublishedStreamPost(post)) {
				return res.status(404).json({ success: false, message: "Stream post not found" });
			}

			let reply = null;
			if (replyId) {
				reply = await StreamReply.findOne({
					id: replyId,
					post_id: String(post.id),
					status: "published",
				});
				if (!reply) {
					return res.status(404).json({ success: false, message: "Stream reply not found" });
				}
			}

			const now = new Date().toISOString();
			const share = new StreamShare({
				id: await generateUniqueShareId(),
				post_id: String(post.id),
				reply_id: reply ? String(reply.id) : null,
				snapshot_url: snapshotUrl,
				title: sanitizeText(req.body?.title, 110),
				excerpt: sanitizeText(req.body?.excerpt, 220),
				author_name: sanitizeText(req.body?.author_name || req.body?.authorName, 60),
				intent: sanitizeText(req.body?.intent, 40),
				shared_post_created_at: sanitizeText(
					req.body?.created_at || req.body?.createdAt || reply?.created_at || post.created_at,
					64
				),
				shared_by_user_id: String(authUser?.id || ""),
				shared_by_name: getAuthDisplayName(authUser, "Member"),
				status: "active",
				metadata:
					req.body?.metadata && typeof req.body.metadata === "object"
						? req.body.metadata
						: {},
				created_at: now,
				updated_at: now,
			});

			await share.save();

			if (snapshotUrl) {
				const metadata =
					post.metadata && typeof post.metadata === "object"
						? { ...post.metadata }
						: {};
				metadata.share_snapshot_url = snapshotUrl;
				metadata.share_snapshot_updated_at = now;
				post.metadata = metadata;
				post.updated_at = now;
				await post.save();
			}

			return res.status(201).json({
				success: true,
				share: serializeShareRecord({ share, post, reply }),
			});
		} catch (error) {
			console.error("Error creating stream share record:", error);
			return res.status(500).json({ success: false, message: "Failed to create stream share" });
		}
	});
}

module.exports = mountShareRoutes;
