const express = require("express");
const Notification = require("../models/notification");
const PushSubscription = require("../models/pushSubscription");
const notificationService = require("../services/notificationService");
const { authenticate } = require("../middleware/auth");

function createNotificationRoutes(pusher) {
	const router = express.Router();

	const isPrivileged = (user) => ["admin", "author"].includes(String(user?.role || "").toLowerCase());

	const canAccessUserNotifications = (authUser, targetUserId) =>
		String(authUser?.id) === String(targetUserId) || isPrivileged(authUser);

	router.get("/", authenticate, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const targetUserId = String(req.query.userId || authUser.id);
			const limitRaw = Number.parseInt(String(req.query.limit || "50"), 10);
			const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

			if (!canAccessUserNotifications(authUser, targetUserId)) {
				return res.status(403).json({ success: false, message: "Insufficient permissions" });
			}

			const notifications = await Notification.find({ user_id: targetUserId })
				.sort({ created_at: -1 })
				.limit(limit);

			return res.json({ success: true, notifications });
		} catch (error) {
			console.error("Error fetching notifications:", error);
			return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
		}
	});

	router.post("/", authenticate, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const {
				user_id,
				userId,
				type = "system",
				message,
				post_id,
				postId,
				post_title,
				postTitle,
				conversation_id,
				metadata = {},
			} = req.body || {};

			const targetUserId = String(user_id || userId || authUser.id);

			if (!message || !String(message).trim()) {
				return res.status(400).json({ success: false, message: "message is required" });
			}

			if (!canAccessUserNotifications(authUser, targetUserId)) {
				return res.status(403).json({ success: false, message: "Insufficient permissions" });
			}

			const saved = await notificationService.createAndEmit({
				user_id: targetUserId,
				type,
				message,
				post_id,
				postId,
				post_title,
				postTitle,
				conversation_id,
				metadata,
			}, pusher);

			return res.status(201).json({ success: true, notification: saved });
		} catch (error) {
			console.error("Error creating notification:", error);
			return res.status(500).json({ success: false, message: "Failed to create notification" });
		}
	});

	// Push Subscription Endpoints
	router.post("/push-subscription", authenticate, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const { subscription, device_label } = req.body;

			if (!subscription || !subscription.endpoint) {
				return res.status(400).json({ success: false, message: "Invalid subscription object" });
			}

			await PushSubscription.findOneAndUpdate(
				{ user_id: authUser.id, "subscription.endpoint": subscription.endpoint },
				{
					user_id: authUser.id,
					subscription,
					device_label: device_label || "Primary device",
					updated_at: new Date().toISOString()
				},
				{ upsert: true, new: true }
			);

			return res.json({ success: true, message: "Push subscription registered" });
		} catch (error) {
			console.error("Error saving push subscription:", error);
			return res.status(500).json({ success: false, message: "Failed to save push subscription" });
		}
	});

	router.delete("/push-subscription", authenticate, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const { endpoint } = req.query;

			if (!endpoint) {
				return res.status(400).json({ success: false, message: "endpoint is required" });
			}

			await PushSubscription.deleteOne({ user_id: authUser.id, "subscription.endpoint": endpoint });

			return res.json({ success: true, message: "Push subscription removed" });
		} catch (error) {
			console.error("Error removing push subscription:", error);
			return res.status(500).json({ success: false, message: "Failed to remove push subscription" });
		}
	});

	router.patch("/:id/read", authenticate, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const notification = await Notification.findOne({ id: String(req.params.id) });

			if (!notification) {
				return res.status(404).json({ success: false, message: "Notification not found" });
			}

			if (!canAccessUserNotifications(authUser, notification.user_id)) {
				return res.status(403).json({ success: false, message: "Insufficient permissions" });
			}

			if (!notification.is_read) {
				notification.is_read = true;
				notification.read_at = new Date().toISOString();
				await notification.save();
			}

			return res.json({ success: true, notification });
		} catch (error) {
			console.error("Error marking notification as read:", error);
			return res.status(500).json({ success: false, message: "Failed to mark notification as read" });
		}
	});

	router.patch("/read-all", authenticate, async (req, res) => {
		try {
			const authUser = req.auth.user;
			const targetUserId = String(req.body?.userId || req.body?.user_id || authUser.id);

			if (!canAccessUserNotifications(authUser, targetUserId)) {
				return res.status(403).json({ success: false, message: "Insufficient permissions" });
			}

			const readAt = new Date().toISOString();
			const result = await Notification.updateMany(
				{ user_id: targetUserId, is_read: false },
				{ $set: { is_read: true, read_at: readAt } }
			);

			return res.json({
				success: true,
				matchedCount: result.matchedCount ?? result.n ?? 0,
				modifiedCount: result.modifiedCount ?? result.nModified ?? 0,
			});
		} catch (error) {
			console.error("Error marking all notifications as read:", error);
			return res.status(500).json({ success: false, message: "Failed to mark all notifications as read" });
		}
	});

	return router;
}

module.exports = createNotificationRoutes;



