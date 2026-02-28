const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema({
    token: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    expires_at: { type: Date, required: true },
    created_at: { type: Date, default: Date.now },
    revoked_at: { type: Date, default: null },
});

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
