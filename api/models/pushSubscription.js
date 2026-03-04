const mongoose = require("mongoose");

const pushSubscriptionSchema = new mongoose.Schema({
    user_id: { type: String, required: true, index: true },
    subscription: {
        endpoint: { type: String, required: true },
        expirationTime: { type: Number, default: null },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true },
        },
    },
    device_label: { type: String, default: "Primary device" },
    created_at: {
        type: String,
        default: () => new Date().toISOString(),
        index: true,
    },
    updated_at: {
        type: String,
        default: () => new Date().toISOString(),
    },
});

// Compound index on user_id and subscription.endpoint to prevent duplicate subscriptions for the same user on the same device
pushSubscriptionSchema.index({ user_id: 1, "subscription.endpoint": 1 }, { unique: true });

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
