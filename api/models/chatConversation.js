const mongoose = require("mongoose");

const chatKeyEnvelopeSchema = new mongoose.Schema(
	{
		user_id: { type: String, required: true },
		key_id: { type: String, default: "" },
		algorithm: { type: String, default: "ECDH-P256+A256GCM" },
		encrypted_key: { type: String, required: true }, // base64 ciphertext of wrapped conversation key
		iv: { type: String, required: true }, // base64 iv used to wrap the conversation key
		sender_key_id: { type: String, default: "" },
		recipient_key_id: { type: String, default: "" },
		created_at: { type: String, default: () => new Date().toISOString() },
	},
	{ _id: false }
);

const chatConversationSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true, index: true },
	type: { type: String, enum: ["direct", "group"], default: "direct", index: true },
	name: { type: String, default: "" },
	member_ids: [{ type: String, index: true }],
	// pair_key: canonical sorted identity for a direct conversation.
	// Format: min(memberA, memberB) + ":" + max(memberA, memberB)
	// This is set on creation and never mutated.
	// A partial unique index on (type="direct", pair_key) enforces the single-thread
	// invariant at the DB level — prevents duplicates even under concurrent writes.
	pair_key: { type: String, default: "", index: true },
	created_by: { type: String, required: true },
	created_at: { type: String, default: () => new Date().toISOString() },
	updated_at: { type: String, default: () => new Date().toISOString(), index: true },
	member_key_envelopes: [chatKeyEnvelopeSchema],
	last_message_meta: {
		sender_id: { type: String, default: "" },
		message_id: { type: String, default: "" },
		content_type: { type: String, default: "text" },
		created_at: { type: String, default: "" },
	},
	metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
});

// Partial unique index: only applies to direct conversations with a non-empty pair_key.
// For any two users A and B, exactly one direct conversation can ever exist.
// Group conversations are excluded (type != "direct").
chatConversationSchema.index(
	{ type: 1, pair_key: 1 },
	{
		unique: true,
		sparse: true,
		name: "unique_direct_pair",
		partialFilterExpression: { type: "direct", pair_key: { $gt: "" } },
	}
);

module.exports = mongoose.model("ChatConversation", chatConversationSchema);
