const express = require("express");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { v2: cloudinary } = require("cloudinary");
const MediaAsset = require("../models/mediaAsset");
const { requireCapabilities } = require("../middleware/auth");

const router = express.Router();

const requireStreamCreate = requireCapabilities("stream:create");
const requireCreatorAnalytics = requireCapabilities("analytics:read:creator", "analytics:read:admin");

const ALLOWED_IMAGE_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/avif",
]);

const ALLOWED_VIDEO_MIME_TYPES = new Set([
	"video/mp4",
	"video/webm",
	"video/quicktime",
	"video/ogg",
]);

const parsePositiveInt = (value, fallback) => {
	const parsed = Number.parseInt(String(value || ""), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_IMAGE_UPLOAD_BYTES = parsePositiveInt(
	process.env.MEDIA_MAX_IMAGE_UPLOAD_BYTES,
	12 * 1024 * 1024
);
const MAX_VIDEO_UPLOAD_BYTES = parsePositiveInt(
	process.env.MEDIA_MAX_VIDEO_UPLOAD_BYTES,
	80 * 1024 * 1024
);
const MAX_VIDEO_DURATION_SECONDS = parsePositiveInt(
	process.env.MEDIA_MAX_VIDEO_DURATION_SECONDS,
	180
);

const resolveUploadLimitBytes = (resourceType) =>
	resourceType === "video" ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;

const validateDeclaredMimeType = (resourceType, mimeType) => {
	const normalizedMime = String(mimeType || "").trim().toLowerCase();
	if (!normalizedMime) return true;
	if (resourceType === "video") return ALLOWED_VIDEO_MIME_TYPES.has(normalizedMime);
	return ALLOWED_IMAGE_MIME_TYPES.has(normalizedMime);
};

const resolveCloudinaryConfig = () => {
	const cloudinaryUrl = process.env.CLOUDINARY_URL || "";
	const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
	const apiKey = process.env.CLOUDINARY_API_KEY || "";
	const apiSecret = process.env.CLOUDINARY_API_SECRET || "";

	if (!cloudinaryUrl && (!cloudName || !apiKey || !apiSecret)) {
		return { enabled: false };
	}

	if (cloudinaryUrl) {
		cloudinary.config({ cloudinary_url: cloudinaryUrl });
		return {
			enabled: true,
			cloudName: cloudinary.config().cloud_name,
			apiKey: cloudinary.config().api_key,
			apiSecret: cloudinary.config().api_secret,
		};
	}

	cloudinary.config({
		cloud_name: cloudName,
		api_key: apiKey,
		api_secret: apiSecret,
		secure: true,
	});
	return {
		enabled: true,
		cloudName,
		apiKey,
		apiSecret,
	};
};

const normalizeResourceType = (value) => {
	const normalized = String(value || "image").trim().toLowerCase();
	if (normalized === "video" || normalized === "raw") return normalized;
	return "image";
};

const sanitizeFolder = (value) => {
	const fallback = "ablegod/uploads";
	const normalized = String(value || fallback)
		.trim()
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\//, "")
		.replace(/\/$/, "");
	return normalized || fallback;
};

const sanitizePublicId = (value) =>
	String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9/_-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

async function destroyCloudinaryAsset(publicId, resourceType = "image") {
	const normalizedPublicId = String(publicId || "").trim();
	if (!normalizedPublicId) return;
	try {
		await cloudinary.uploader.destroy(normalizedPublicId, {
			resource_type: resourceType === "video" || resourceType === "raw" ? resourceType : "image",
			invalidate: true,
		});
	} catch (error) {
		console.warn("Failed to destroy oversized Cloudinary asset:", error?.message || error);
	}
}

router.post("/sign-upload", ...requireStreamCreate, async (req, res) => {
	try {
		const cfg = resolveCloudinaryConfig();
		if (!cfg.enabled) {
			return res.status(503).json({
				success: false,
				message: "Cloudinary is not configured",
			});
		}

		const authUser = req.auth?.user || {};
		const resourceType = normalizeResourceType(req.body?.resource_type || req.body?.resourceType);
		const declaredBytes = Math.max(0, Number(req.body?.file_bytes || req.body?.fileBytes || 0));
		const declaredDuration = Math.max(0, Number(req.body?.duration || 0));
		const declaredMimeType = String(req.body?.mime_type || req.body?.mimeType || "").trim().toLowerCase();
		const maxBytes = resolveUploadLimitBytes(resourceType);
		if (declaredBytes > 0 && declaredBytes > maxBytes) {
			return res.status(413).json({
				success: false,
				message:
					resourceType === "video"
						? `Video exceeds size limit (${Math.round(MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024))} MB).`
						: `Image exceeds size limit (${Math.round(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024))} MB).`,
			});
		}
		if (!validateDeclaredMimeType(resourceType, declaredMimeType)) {
			return res.status(415).json({
				success: false,
				message:
					resourceType === "video"
						? "Unsupported video format. Use MP4, WebM, MOV, or OGG."
						: "Unsupported image format. Use JPEG, PNG, WebP, GIF, or AVIF.",
			});
		}
		if (resourceType === "video" && declaredDuration > MAX_VIDEO_DURATION_SECONDS) {
			return res.status(413).json({
				success: false,
				message: `Video duration exceeds limit (${MAX_VIDEO_DURATION_SECONDS} seconds).`,
			});
		}
		const folder = sanitizeFolder(req.body?.folder || req.body?.upload_folder || "ablegod/uploads");
		const timestamp = Math.floor(Date.now() / 1000);
		const requestedPublicId = sanitizePublicId(req.body?.public_id || req.body?.publicId);
		const generatedSuffix = `${Date.now()}-${uuidv4().slice(0, 8)}`;
		const publicId = requestedPublicId || `u_${String(authUser.id || "anon")}/${generatedSuffix}`;

		const signableParams = {
			folder,
			public_id: publicId,
			timestamp,
		};

		const tags = Array.isArray(req.body?.tags)
			? req.body.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
			: [];
		if (tags.length > 0) {
			signableParams.tags = tags.join(",");
		}

		const contextInput =
			req.body?.context && typeof req.body.context === "object"
				? req.body.context
				: {};
		const contextPairs = Object.entries(contextInput)
			.map(([key, value]) => `${String(key).trim()}=${String(value ?? "").trim()}`)
			.filter((entry) => entry && !entry.endsWith("="));
		if (contextPairs.length > 0) {
			signableParams.context = contextPairs.join("|");
		}

		const signature = cloudinary.utils.api_sign_request(signableParams, cfg.apiSecret);
		return res.json({
			success: true,
			upload: {
				cloud_name: cfg.cloudName,
				api_key: cfg.apiKey,
				timestamp,
				signature,
				folder,
				public_id: publicId,
				resource_type: resourceType,
				tags,
				context: signableParams.context || "",
				upload_url: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`,
				limits: {
					max_image_upload_bytes: MAX_IMAGE_UPLOAD_BYTES,
					max_video_upload_bytes: MAX_VIDEO_UPLOAD_BYTES,
					max_video_duration_seconds: MAX_VIDEO_DURATION_SECONDS,
				},
			},
		});
	} catch (error) {
		console.error("Error generating Cloudinary upload signature:", error);
		return res.status(500).json({
			success: false,
			message: "Failed to sign media upload",
		});
	}
});

router.post("/assets/register", ...requireStreamCreate, async (req, res) => {
	try {
		const authUser = req.auth?.user || {};
		const payload = req.body?.asset && typeof req.body.asset === "object" ? req.body.asset : req.body || {};
		const publicId = String(payload.public_id || payload.publicId || "").trim();
		const secureUrl = String(payload.secure_url || payload.secureUrl || "").trim();
		if (!publicId || !secureUrl) {
			return res.status(400).json({
				success: false,
				message: "public_id and secure_url are required",
			});
		}

		const now = new Date().toISOString();
		const resourceType = normalizeResourceType(payload.resource_type || payload.resourceType);
		const bytes = Math.max(0, Number(payload.bytes || 0));
		const duration = Math.max(0, Number(payload.duration || 0));
		const maxBytes = resolveUploadLimitBytes(resourceType);
		if (bytes > maxBytes) {
			await destroyCloudinaryAsset(publicId, resourceType);
			return res.status(413).json({
				success: false,
				message:
					resourceType === "video"
						? `Video exceeds size limit (${Math.round(MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024))} MB).`
						: `Image exceeds size limit (${Math.round(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024))} MB).`,
			});
		}
		if (resourceType === "video" && duration > MAX_VIDEO_DURATION_SECONDS) {
			await destroyCloudinaryAsset(publicId, resourceType);
			return res.status(413).json({
				success: false,
				message: `Video duration exceeds limit (${MAX_VIDEO_DURATION_SECONDS} seconds).`,
			});
		}
		const folder = sanitizeFolder(payload.folder || payload.asset_folder || "ablegod/uploads");
		const tags = Array.isArray(payload.tags)
			? payload.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
			: [];
		const context =
			payload.context && typeof payload.context === "object" ? payload.context : {};
		const metadata =
			payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
		const incomingStatus = String(payload.status || "ready").toLowerCase();
		const status =
			incomingStatus === "pending" ||
			incomingStatus === "ready" ||
			incomingStatus === "failed" ||
			incomingStatus === "deleted"
				? incomingStatus
				: "ready";

		let asset = await MediaAsset.findOne({ public_id: publicId });
		if (!asset) {
			asset = new MediaAsset({
				id: uuidv4(),
				owner_user_id: String(authUser.id || ""),
				owner_role: String(authUser.role || "user"),
				provider: "cloudinary",
				resource_type: resourceType,
				public_id: publicId,
				folder,
				secure_url: secureUrl,
				url: String(payload.url || secureUrl),
				format: String(payload.format || ""),
				version: String(payload.version || ""),
				bytes,
				width: Math.max(0, Number(payload.width || 0)),
				height: Math.max(0, Number(payload.height || 0)),
				duration,
				status,
				tags,
				context,
				metadata,
				created_at: now,
				updated_at: now,
			});
		} else {
			asset.owner_user_id = String(asset.owner_user_id || authUser.id || "");
			asset.owner_role = String(asset.owner_role || authUser.role || "user");
			asset.resource_type = resourceType;
			asset.folder = folder;
			asset.secure_url = secureUrl;
			asset.url = String(payload.url || secureUrl);
			asset.format = String(payload.format || asset.format || "");
			asset.version = String(payload.version || asset.version || "");
			asset.bytes = bytes || Math.max(0, Number(asset.bytes || 0));
			asset.width = Math.max(0, Number(payload.width || asset.width || 0));
			asset.height = Math.max(0, Number(payload.height || asset.height || 0));
			asset.duration = duration || Math.max(0, Number(asset.duration || 0));
			asset.status = status;
			asset.tags = tags;
			asset.context = context;
			asset.metadata = metadata;
			asset.updated_at = now;
		}

		await asset.save();
		return res.status(201).json({ success: true, asset });
	} catch (error) {
		console.error("Error registering media asset:", error);
		return res.status(500).json({
			success: false,
			message: "Failed to register media asset",
		});
	}
});

router.get("/assets/me", ...requireStreamCreate, async (req, res) => {
	try {
		const authUserId = String(req.auth?.user?.id || "");
		const limitRaw = Number.parseInt(String(req.query.limit || "40"), 10);
		const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 120) : 40;
		const resourceType = req.query.resource_type ? normalizeResourceType(req.query.resource_type) : null;

		const query = { owner_user_id: authUserId };
		if (resourceType) query.resource_type = resourceType;
		const assets = await MediaAsset.find(query).sort({ updated_at: -1, created_at: -1 }).limit(limit);
		return res.json({
			success: true,
			assets,
			count: assets.length,
		});
	} catch (error) {
		console.error("Error fetching media assets:", error);
		return res.status(500).json({
			success: false,
			message: "Failed to fetch media assets",
		});
	}
});

router.get("/assets/analytics", ...requireCreatorAnalytics, async (req, res) => {
	try {
		const authUser = req.auth?.user || {};
		const isAdmin = String(authUser.role || "").toLowerCase() === "admin";
		const targetUserId = isAdmin && req.query.user_id ? String(req.query.user_id) : String(authUser.id || "");
		const match = targetUserId ? { owner_user_id: targetUserId } : {};
		const [totals, byType] = await Promise.all([
			MediaAsset.aggregate([
				{ $match: match },
				{
					$group: {
						_id: null,
						total_assets: { $sum: 1 },
						total_bytes: { $sum: { $ifNull: ["$bytes", 0] } },
						total_duration: { $sum: { $ifNull: ["$duration", 0] } },
					},
				},
			]),
			MediaAsset.aggregate([
				{ $match: match },
				{
					$group: {
						_id: "$resource_type",
						count: { $sum: 1 },
						bytes: { $sum: { $ifNull: ["$bytes", 0] } },
					},
				},
			]),
		]);

		const summary = totals[0] || { total_assets: 0, total_bytes: 0, total_duration: 0 };
		return res.json({
			success: true,
			analytics: {
				user_id: targetUserId,
				total_assets: Number(summary.total_assets || 0),
				total_bytes: Number(summary.total_bytes || 0),
				total_duration: Number(summary.total_duration || 0),
				by_type: byType.map((row) => ({
					resource_type: String(row._id || "image"),
					count: Number(row.count || 0),
					bytes: Number(row.bytes || 0),
				})),
			},
		});
	} catch (error) {
		console.error("Error fetching media analytics:", error);
		return res.status(500).json({
			success: false,
			message: "Failed to fetch media analytics",
		});
	}
});

router.post("/webhook/cloudinary", express.json({ type: "*/*" }), async (req, res) => {
	try {
		const cfg = resolveCloudinaryConfig();
		if (!cfg.enabled) {
			return res.status(503).json({ success: false, message: "Cloudinary is not configured" });
		}

		const signature = String(req.get("x-cld-signature") || "");
		const timestamp = String(req.get("x-cld-timestamp") || "");
		const body = req.body && typeof req.body === "object" ? req.body : {};
		const expected = cloudinary.utils.api_sign_request(body, cfg.apiSecret);
		const expectedSha1 = crypto
			.createHash("sha1")
			.update(`${String(timestamp)}${JSON.stringify(body)}${cfg.apiSecret}`)
			.digest("hex");

		if (!signature || (signature !== expected && signature !== expectedSha1)) {
			return res.status(401).json({ success: false, message: "Invalid webhook signature" });
		}

		const publicId = String(body.public_id || "").trim();
		if (!publicId) return res.status(200).json({ success: true, ignored: true });

		const asset = await MediaAsset.findOne({ public_id: publicId });
		if (!asset) return res.status(200).json({ success: true, ignored: true });

		const now = new Date().toISOString();
		asset.status = String(body.notification_type || "").includes("failed") ? "failed" : "ready";
		asset.secure_url = String(body.secure_url || asset.secure_url || "");
		asset.url = String(body.url || asset.url || asset.secure_url || "");
		asset.resource_type = normalizeResourceType(body.resource_type || asset.resource_type);
		asset.bytes = Math.max(0, Number(body.bytes || asset.bytes || 0));
		asset.width = Math.max(0, Number(body.width || asset.width || 0));
		asset.height = Math.max(0, Number(body.height || asset.height || 0));
		asset.duration = Math.max(0, Number(body.duration || asset.duration || 0));
		asset.format = String(body.format || asset.format || "");
		asset.version = String(body.version || asset.version || "");
		asset.updated_at = now;
		const nextMetadata =
			asset.metadata && typeof asset.metadata === "object" ? { ...asset.metadata } : {};
		nextMetadata.webhook_last_payload = body;
		nextMetadata.webhook_last_seen_at = now;
		asset.metadata = nextMetadata;
		await asset.save();

		return res.status(200).json({ success: true });
	} catch (error) {
		console.error("Error processing Cloudinary webhook:", error);
		return res.status(500).json({ success: false, message: "Failed to process webhook" });
	}
});

module.exports = router;
