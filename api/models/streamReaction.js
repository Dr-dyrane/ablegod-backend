const mongoose = require("mongoose");

const streamReactionSchema = new mongoose.Schema(
	{
		id: { type: String, index: true, unique: true },
		target_type: { type: String, enum: ["post", "reply"], index: true, required: true },
		target_id: { type: String, index: true, required: true },
		post_id: { type: String, index: true, required: true },
		reply_id: { type: String, default: null, index: true },
		user_id: { type: String, index: true, required: true },
		user_name: String,
		reaction_type: {
			type: String,
			enum: ["like", "amen", "pray"],
			required: true,
			index: true,
		},
		created_at: { type: String, index: true, default: () => new Date().toISOString() },
		updated_at: { type: String, default: () => new Date().toISOString() },
	},
	{ minimize: true }
);

streamReactionSchema.index(
	{ target_type: 1, target_id: 1, user_id: 1 },
	{ unique: true, name: "unique_user_reaction_per_target" }
);

module.exports = mongoose.model("StreamReaction", streamReactionSchema);
