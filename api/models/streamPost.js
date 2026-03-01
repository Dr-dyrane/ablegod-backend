const mongoose = require("mongoose");

const streamPostSchema = new mongoose.Schema(
	{
		id: { type: String, index: true, unique: true },
		author_user_id: { type: String, index: true },
		author_name: String,
		author_username: String,
		author_avatar_url: String,
		author_role: String,
		intent: String, // Reflection, Prayer, Testimony, Question, Encouragement
		title: String,
		content: String,
		excerpt: String,
		image_url: String,
		status: { type: String, default: "published" }, // published | draft
		reply_count: { type: Number, default: 0 },
		like_count: { type: Number, default: 0 },
		reaction_counts: {
			type: mongoose.Schema.Types.Mixed,
			default: { like: 0, amen: 0, pray: 0 },
		},
		bookmark_count: { type: Number, default: 0 },
		restream_count: { type: Number, default: 0 },
		share_count: { type: Number, default: 0 },
		view_count: { type: Number, default: 0 },
		metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
		edit_history: [{
			content: String,
			title: String,
			image_url: String,
			edited_at: { type: String, default: () => new Date().toISOString() },
			reason: String,
		}],
		created_at: { type: String, index: true },
		updated_at: String,
	},
	{ minimize: true }
);

module.exports = mongoose.model("StreamPost", streamPostSchema);
