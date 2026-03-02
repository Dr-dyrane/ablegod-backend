const mongoose = require("mongoose");

const streamModerationActionSchema = new mongoose.Schema(
	{
		id: { type: String, index: true, unique: true },
		target_type: { type: String, enum: ["post", "reply", "circle", "chat_message"], index: true },
		target_id: { type: String, index: true },
		post_id: { type: String, index: true },
		reply_id: { type: String, default: null, index: true },
		action_scope: { type: String, default: "moderation" }, // moderation | feature
		action: String,
		status: String,
		note: String,
		actor_user_id: { type: String, index: true },
		actor_name: String,
		metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
		created_at: { type: String, index: true },
	},
	{ minimize: true }
);

module.exports = mongoose.model("StreamModerationAction", streamModerationActionSchema);
