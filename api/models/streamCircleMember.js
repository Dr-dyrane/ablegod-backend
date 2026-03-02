const mongoose = require("mongoose");

const streamCircleMemberSchema = new mongoose.Schema(
	{
		id: { type: String, index: true, unique: true },
		circle_id: { type: String, index: true, required: true },
		user_id: { type: String, index: true, required: true },
		user_name: { type: String, default: "" },
		role: {
			type: String,
			enum: ["owner", "moderator", "member"],
			default: "member",
			index: true,
		},
		status: {
			type: String,
			enum: ["active", "removed"],
			default: "active",
			index: true,
		},
		joined_at: { type: String, default: () => new Date().toISOString() },
		created_at: { type: String, index: true, default: () => new Date().toISOString() },
		updated_at: { type: String, default: () => new Date().toISOString() },
		metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
	},
	{ minimize: true }
);

streamCircleMemberSchema.index(
	{ circle_id: 1, user_id: 1 },
	{ unique: true, name: "unique_stream_circle_member_pair" }
);

module.exports = mongoose.model("StreamCircleMember", streamCircleMemberSchema);

