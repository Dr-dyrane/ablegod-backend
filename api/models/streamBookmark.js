const mongoose = require("mongoose");

const streamBookmarkSchema = new mongoose.Schema(
    {
        id: { type: String, index: true, unique: true },
        post_id: { type: String, index: true, required: true },
        user_id: { type: String, index: true, required: true },
        created_at: { type: String, index: true, default: () => new Date().toISOString() },
    },
    { minimize: true }
);

streamBookmarkSchema.index({ post_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model("StreamBookmark", streamBookmarkSchema);
