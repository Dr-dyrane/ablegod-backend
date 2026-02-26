const mongoose = require("mongoose");

const streamReportSchema = new mongoose.Schema(
	{
		id: { type: String, index: true, unique: true },
		target_type: { type: String, enum: ["post", "reply"], index: true },
		target_id: { type: String, index: true },
		post_id: { type: String, index: true },
		reply_id: { type: String, default: null, index: true },
		reported_user_id: { type: String, index: true },
		reporter_user_id: { type: String, index: true },
		reporter_name: String,
		reason: String,
		note: String,
		status: { type: String, default: "open", index: true }, // open | under_review | resolved
		resolved_by_user_id: { type: String, default: null },
		resolved_by_name: { type: String, default: null },
		resolved_at: { type: String, default: null },
		metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
		created_at: { type: String, index: true },
		updated_at: String,
	},
	{ minimize: true }
);

module.exports = mongoose.model("StreamReport", streamReportSchema);
