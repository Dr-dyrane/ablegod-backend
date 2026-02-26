const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Notification = require("../models/notification");
const { authenticate } = require("../middleware/auth");

function createNotificationRoutes(pusher) {
	const router = express.Router();

	const isPrivileged = (user) => ["admin", "author"].includes(String(user?.role || "").toLowerCase());

	const canAccessUserNotifications = (authUser, targetUserId) =>
		String(authUser?.id) === String(targetUserId) || isPrivileged(authUser);

	const emitNotificationEvent = (notification) => {
		if (!pusher) return;
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
		};

		pusher.trigger(`user-${notification.user_id}`, "notification:new", payload);
		pusher.trigger("notifications", "receiveNotification", {
			message: notification.message,
			userId: notification.user_id,
			type: notification.type,
		});
	};

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
				metadata = {},
			} = req.body || {};

			const targetUserId = String(user_id || userId || authUser.id);

			if (!message || !String(message).trim()) {
				return res.status(400).json({ success: false, message: "message is required" });
			}

			if (!canAccessUserNotifications(authUser, targetUserId)) {
				return res.status(403).json({ success: false, message: "Insufficient permissions" });
			}

			const notification = new Notification({
				id: uuidv4(),
				user_id: targetUserId,
				type: String(type || "system"),
				message: String(message).trim(),
				post_id: typeof post_id === "number" ? post_id : (typeof postId === "number" ? postId : null),
				post_title: String(post_title || postTitle || ""),
				metadata,
				is_read: false,
				created_at: new Date().toISOString(),
				read_at: null,
			});

			const saved = await notification.save();
			emitNotificationEvent(saved);

			return res.status(201).json({ success: true, notification: saved });
		} catch (error) {
			console.error("Error creating notification:", error);
			return res.status(500).json({ success: false, message: "Failed to create notification" });
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

