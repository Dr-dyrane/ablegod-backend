const mongoose = require("mongoose");

const mediaAssetSchema = new mongoose.Schema(
	{
		id: { type: String, required: true, unique: true, index: true },
		owner_user_id: { type: String, required: true, index: true },
		owner_role: { type: String, default: "user", index: true },
		provider: { type: String, default: "cloudinary", index: true },
		resource_type: { type: String, enum: ["image", "video", "raw"], default: "image", index: true },
		public_id: { type: String, required: true, unique: true, index: true },
		folder: { type: String, default: "ablegod/uploads", index: true },
		secure_url: { type: String, default: "" },
		url: { type: String, default: "" },
		format: { type: String, default: "" },
		version: { type: String, default: "" },
		bytes: { type: Number, default: 0 },
		width: { type: Number, default: 0 },
		height: { type: Number, default: 0 },
		duration: { type: Number, default: 0 },
		status: { type: String, enum: ["pending", "ready", "failed", "deleted"], default: "ready", index: true },
		tags: [{ type: String }],
		context: { type: mongoose.Schema.Types.Mixed, default: {} },
		metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
		created_at: { type: String, default: () => new Date().toISOString(), index: true },
		updated_at: { type: String, default: () => new Date().toISOString(), index: true },
	},
	{ minimize: true }
);

module.exports = mongoose.model("MediaAsset", mediaAssetSchema);
