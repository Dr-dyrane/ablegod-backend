const mongoose = require("mongoose");

const streamCircleSchema = new mongoose.Schema(
	{
		id: { type: String, index: true, unique: true },
		slug: { type: String, index: true, unique: true },
		name: { type: String, required: true, trim: true },
		description: { type: String, default: "" },
		visibility: {
			type: String,
			enum: ["public", "closed", "secret"],
			default: "public",
			index: true,
		},
		owner_user_id: { type: String, index: true, required: true },
		owner_name: { type: String, default: "" },
		avatar_url: { type: String, default: "" },
		cover_url: { type: String, default: "" },
		member_count: { type: Number, default: 1 },
		post_count: { type: Number, default: 0 },
		metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
		created_at: { type: String, index: true, default: () => new Date().toISOString() },
		updated_at: { type: String, default: () => new Date().toISOString() },
	},
	{ minimize: true }
);

streamCircleSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("StreamCircle", streamCircleSchema);

