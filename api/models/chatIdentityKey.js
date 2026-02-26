const mongoose = require("mongoose");

const chatIdentityKeySchema = new mongoose.Schema(
	{
		id: { type: String, required: true, unique: true, index: true },
		user_id: { type: String, required: true, index: true },
		key_id: { type: String, required: true, index: true },
		algorithm: { type: String, default: "ECDH-P256" },
		public_key_jwk: { type: mongoose.Schema.Types.Mixed, required: true },
		device_label: { type: String, default: "" },
		status: { type: String, enum: ["active", "revoked"], default: "active", index: true },
		created_at: { type: String, default: () => new Date().toISOString() },
		updated_at: { type: String, default: () => new Date().toISOString() },
		last_seen_at: { type: String, default: () => new Date().toISOString() },
	},
	{ versionKey: false }
);

chatIdentityKeySchema.index({ user_id: 1, key_id: 1 }, { unique: true });

module.exports = mongoose.model("ChatIdentityKey", chatIdentityKeySchema);

