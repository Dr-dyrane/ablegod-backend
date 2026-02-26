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

module.exports = mongoose.model("ChatConversation", chatConversationSchema);

