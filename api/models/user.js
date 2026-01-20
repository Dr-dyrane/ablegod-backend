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
			type: String,
			timestamp: String,
			details: String,
		},
	],
});

module.exports = mongoose.model("User", userSchema);
