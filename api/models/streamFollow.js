const mongoose = require("mongoose");

const streamFollowSchema = new mongoose.Schema(
	{
		id: { type: String, index: true, unique: true },
		follower_user_id: { type: String, index: true, required: true },
		followed_user_id: { type: String, index: true, required: true },
		follower_name: String,
		followed_name: String,
		status: { type: String, default: "active", index: true },
		created_at: { type: String, index: true, default: () => new Date().toISOString() },
		updated_at: { type: String, default: () => new Date().toISOString() },
	},
	{ minimize: true }
);

streamFollowSchema.index(
	{ follower_user_id: 1, followed_user_id: 1 },
	{ unique: true, name: "unique_stream_follow_pair" }
);

module.exports = mongoose.model("StreamFollow", streamFollowSchema);
