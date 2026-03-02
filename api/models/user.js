// api/models/user.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
	id: String, // String id supports UUID-based identities.
	username: String,
	first_name: String,
	last_name: String,
	email: String,
	role: String,
	status: String,
	avatar_url: String,
	bio: String,
	website: String,
	twitter: String,
	linkedin: String,
	password: String,
	password_reset_token_hash: String,
	password_reset_token_expires_at: String,
	password_reset_requested_at: String,
	followers_count: { type: Number, default: 0 },
	following_count: { type: Number, default: 0 },
	verified: { type: Boolean, default: false },
	stream_creator_featured: { type: Boolean, default: false, index: true },
	stream_creator_featured_updated_at: String,
	createdAt: String,
	lastLogin: String,
	recent_activity: { // Renamed/Structured for Portal compatibility if needed, or keeping simple
		comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
		likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
		downloads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }]
	},
	// Keeping legacy structure for backwards compat if needed
	activities: [
		{
			id: Number,
			type: { type: String },
			timestamp: String,
			details: String,
		},
	],
	ai_settings: {
		openai_key: String,
		anthropic_key: String,
		preferred_model: { type: String, default: 'gpt-4o-mini' },
		enable_writing_assistant: { type: Boolean, default: true },
		enable_bible_suggestions: { type: Boolean, default: true },
		enable_content_moderation: { type: Boolean, default: false },
	},
});

userSchema.index({ id: 1 });
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ first_name: 1 });
userSchema.index({ last_name: 1 });
userSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
