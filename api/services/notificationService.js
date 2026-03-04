const { v4: uuidv4 } = require("uuid");
const webpush = require("web-push");
const Notification = require("../models/notification");
const PushSubscription = require("../models/pushSubscription");

// Configure web-push with VAPID keys from environment
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVAPIDDetails(
        "mailto:admin@chistanwrites.blog",
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

const notificationService = {
    /**
     * Emit a notification to both realtime (Pusher/Socket.io) and Web Push (background).
     * @param {object} notification - The notification document.
     * @param {object} realtimeDispatcher - The dispatcher for socket/pusher events.
     */
    async emitNotification(notification, realtimeDispatcher) {
        // 1. Realtime (Foreground)
        if (realtimeDispatcher) {
            const payload = {
                id: notification.id,
                type: notification.type,
                message: notification.message,
                post_id: notification.post_id ?? null,
                post_title: notification.post_title || "",
                is_read: notification.is_read,
                created_at: notification.created_at,
                user_id: notification.user_id,
                metadata: notification.metadata || {},
                conversation_id: notification.conversation_id || null,
            };

            realtimeDispatcher.trigger(`user-${notification.user_id}`, "notification:new", payload);
        }

        // 2. Web Push (Background)
        if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
            try {
                const subscriptions = await PushSubscription.find({ user_id: notification.user_id });
                if (subscriptions.length > 0) {
                    const pushPayload = JSON.stringify({
                        title: notification.type === "chat_message" ? "New Message" : "Ablegod",
                        body: notification.message,
                        data: {
                            id: notification.id,
                            type: notification.type,
                            url: notification.type === "chat_message"
                                ? `/user/messages/${notification.conversation_id}`
                                : "/user/notifications",
                        },
                        icon: "/icon-192x192.png",
                        badge: "/badge-72x72.png",
                        vibrate: [100, 50, 100],
                    });

                    const sendPromises = subscriptions.map(async (sub) => {
                        try {
                            await webpush.sendNotification(sub.subscription, pushPayload);
                        } catch (error) {
                            if (error.statusCode === 404 || error.statusCode === 410) {
                                console.warn("Expired push subscription removed:", sub._id);
                                await PushSubscription.deleteOne({ _id: sub._id });
                            } else {
                                console.error("Web Push error:", error);
                            }
                        }
                    });

                    await Promise.all(sendPromises);
                }
            } catch (error) {
                console.error("Failed to process web push notifications:", error);
            }
        }
    },

    /**
     * Create and emit a notification.
     */
    async createAndEmit(data, realtimeDispatcher) {
        const notification = new Notification({
            id: uuidv4(),
            user_id: String(data.user_id || data.userId),
            type: String(data.type || "system"),
            message: String(data.message).trim(),
            post_id: data.post_id || data.postId || null,
            post_title: String(data.post_title || data.postTitle || ""),
            conversation_id: data.conversation_id || data.conversationId || null,
            metadata: data.metadata || {},
            is_read: false,
            created_at: new Date().toISOString(),
        });

        const saved = await notification.save();
        await this.emitNotification(saved, realtimeDispatcher);
        return saved;
    }
};

module.exports = notificationService;
