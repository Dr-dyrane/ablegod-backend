const mongoose = require("mongoose");

const streamShareSchema = new mongoose.Schema(
	{
		id: { type: String, required: true, unique: true, index: true },
		post_id: { type: String, required: true, index: true },
		reply_id: { type: String, default: null, index: true },
		snapshot_url: { type: String, default: "" },
		title: { type: String, default: "" },
		excerpt: { type: String, default: "" },
		author_name: { type: String, default: "" },
		intent: { type: String, default: "" },
		shared_post_created_at: { type: String, default: "" },
		shared_by_user_id: { type: String, default: "" },
		shared_by_name: { type: String, default: "" },
		status: { type: String, default: "active", index: true },
		metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
		created_at: { type: String, required: true, index: true },
		updated_at: { type: String, required: true },
	},
	{ minimize: true }
);

streamShareSchema.index({ post_id: 1, created_at: -1 });
streamShareSchema.index({ shared_by_user_id: 1, created_at: -1 });

module.exports = mongoose.model("StreamShare", streamShareSchema);
