// api/models/user.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
	id: String, // Changed to String to support Supabase UUIDs
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
});

module.exports = mongoose.model("User", userSchema);
