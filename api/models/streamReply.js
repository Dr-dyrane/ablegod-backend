const mongoose = require("mongoose");

const streamReplySchema = new mongoose.Schema(
	{
		id: { type: String, index: true, unique: true },
		post_id: { type: String, index: true },
		parent_reply_id: { type: String, default: null, index: true },
		author_user_id: { type: String, index: true },
		author_name: String,
		author_username: String,
		author_avatar_url: String,
		author_role: String,
		content: String,
		status: { type: String, default: "published" },
		like_count: { type: Number, default: 0 },
		restream_count: { type: Number, default: 0 },
		bookmark_count: { type: Number, default: 0 },
		share_count: { type: Number, default: 0 },
		view_count: { type: Number, default: 0 },
		reaction_counts: {
			type: mongoose.Schema.Types.Mixed,
			default: { like: 0, amen: 0, pray: 0 },
		},
		metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
		edit_history: [{
			content: String,
			edited_at: { type: String, default: () => new Date().toISOString() },
			reason: String,
		}],
		created_at: { type: String, index: true },
		updated_at: String,
	},
	{ minimize: true }
);

module.exports = mongoose.model("StreamReply", streamReplySchema);
