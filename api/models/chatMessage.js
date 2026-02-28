const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true, index: true },
	conversation_id: { type: String, required: true, index: true },
	sender_id: { type: String, required: true, index: true },
	content_type: { type: String, default: "text" },
	algorithm: { type: String, default: "AES-GCM-256" },
	key_id: { type: String, default: "" },
	ciphertext: { type: String, required: false }, // base64 - optional for plain messages
	iv: { type: String, required: false }, // base64 - optional for plain messages
	aad: { type: String, default: "" }, // optional base64 encoded associated data
	content: { type: String, required: false }, // Plain text content for unrestricted chat
	metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
	created_at: { type: String, default: () => new Date().toISOString(), index: true },
	edited_at: { type: String, default: null },
	deleted_at: { type: String, default: null },
});

module.exports = mongoose.model("ChatMessage", chatMessageSchema);

