const express = require("express");
const { v4: uuidv4 } = require("uuid");
const ChatConversation = require("../models/chatConversation");
const ChatMessage = require("../models/chatMessage");
const ChatIdentityKey = require("../models/chatIdentityKey");
const User = require("../models/user");
const { requireCapabilities, authenticate } = require("../middleware/auth");

function createChatRoutes(pusher) {
	const router = express.Router();

	const requireChatRead = requireCapabilities("chat:read");
	const requireChatSend = requireCapabilities("chat:send");

	const sanitizeIdentityKey = (record) => ({
		id: record.id,
		user_id: String(record.user_id),
		key_id: String(record.key_id || ""),
		algorithm: String(record.algorithm || "ECDH-P256"),
		public_key_jwk: record.public_key_jwk || null,
		device_label: String(record.device_label || ""),
		status: String(record.status || "active"),
		created_at: record.created_at,
		updated_at: record.updated_at,
		last_seen_at: record.last_seen_at,
	});

	const toParticipantSummary = (user, hasIdentityKey = false) => ({
		id: String(user.id),
		username: user.username || "",
		name:
			[user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
			user.username ||
			user.email ||
			"User",
		email: user.email || "",
		role: user.role || "user",
		status: user.status || "active",
		avatar_url: user.avatar_url || "",
		has_identity_key: Boolean(hasIdentityKey),
	});

	const normalizeMemberIds = (authUserId, inputMemberIds) => {
		const raw = Array.isArray(inputMemberIds) ? inputMemberIds : [];
		return [...new Set([String(authUserId), ...raw.map((id) => String(id)).filter(Boolean)])];
	};

	const ensureConversationMember = async (req, res, next) => {
		try {
			const conversationId = String(req.params.conversationId || "");
			const conversation = await ChatConversation.findOne({ id: conversationId });
			if (!conversation) {
				return res.status(404).json({ success: false, message: "Conversation not found" });
			}

			const authUserId = String(req.auth?.user?.id || "");
			const isMember = (conversation.member_ids || []).some((memberId) => String(memberId) === authUserId);
			const isPrivileged = ["admin", "author"].includes(String(req.auth?.user?.role || "").toLowerCase());
			if (!isMember && !isPrivileged) {
				return res.status(403).json({ success: false, message: "Insufficient permissions" });
			}

			req.chatConversation = conversation;
			next();
		} catch (error) {
			console.error("Chat conversation membership check failed:", error);
			return res.status(500).json({ success: false, message: "Failed to validate conversation access" });
		}
	};

	const emitChatMessage = (conversation, message) => {
		if (!pusher) return;
		pusher.trigger(`conversation-${conversation.id}`, "chat:message", {
			conversation_id: conversation.id,
			message,
		});
	};

	router.get("/identity-keys/me", ...requireChatRead, async (req, res) => {
		try {
			const authUserId = String(req.auth.user.id);
			const keys = await ChatIdentityKey.find({
				user_id: authUserId,
				status: "active",
			}).sort({ updated_at: -1 });

			return res.json({ success: true, keys: keys.map(sanitizeIdentityKey) });
		} catch (error) {
			console.error("Error fetching chat identity keys (self):", error);
			return res.status(500).json({ success: false, message: "Failed to fetch identity keys" });
		}
	});

	router.put("/identity-keys/me", ...requireChatSend, async (req, res) => {
		try {
			const authUserId = String(req.auth.user.id);
			const {
				keyId,
				key_id,
				algorithm = "ECDH-P256",
				publicKeyJwk,
				public_key_jwk,
				deviceLabel = "",
				device_label,
			} = req.body || {};

			const normalizedKeyId = String(keyId || key_id || "").trim();
			const normalizedPublicJwk = publicKeyJwk || public_key_jwk || null;

			if (!normalizedKeyId) {
				return res.status(400).json({ success: false, message: "keyId is required" });
			}

			if (!normalizedPublicJwk || typeof normalizedPublicJwk !== "object") {
				return res.status(400).json({ success: false, message: "publicKeyJwk is required" });
			}

			const now = new Date().toISOString();
			const existing = await ChatIdentityKey.findOne({
				user_id: authUserId,
				key_id: normalizedKeyId,
			});

			if (existing) {
				existing.algorithm = String(algorithm || existing.algorithm || "ECDH-P256");
				existing.public_key_jwk = normalizedPublicJwk;
				existing.device_label = String(deviceLabel || device_label || existing.device_label || "");
				existing.status = "active";
				existing.updated_at = now;
				existing.last_seen_at = now;
				await existing.save();
				return res.json({ success: true, key: sanitizeIdentityKey(existing), created: false });
			}

			const created = new ChatIdentityKey({
				id: uuidv4(),
				user_id: authUserId,
				key_id: normalizedKeyId,
				algorithm: String(algorithm || "ECDH-P256"),
				public_key_jwk: normalizedPublicJwk,
				device_label: String(deviceLabel || device_label || ""),
				status: "active",
				created_at: now,
				updated_at: now,
				last_seen_at: now,
			});

			await created.save();
			return res.status(201).json({ success: true, key: sanitizeIdentityKey(created), created: true });
		} catch (error) {
			console.error("Error registering chat identity key:", error);
			return res.status(500).json({ success: false, message: "Failed to register identity key" });
		}
	});

	router.get("/identity-keys/:userId", ...requireChatRead, async (req, res) => {
		try {
			const targetUserId = String(req.params.userId || "");
			if (!targetUserId) {
				return res.status(400).json({ success: false, message: "userId is required" });
			}

			const user = await User.findOne({ $or: [{ id: targetUserId }, { id: Number(targetUserId) || targetUserId }] });
			if (!user) {
				return res.status(404).json({ success: false, message: "User not found" });
			}

			const keys = await ChatIdentityKey.find({
				user_id: targetUserId,
				status: "active",
			}).sort({ updated_at: -1 });

			return res.json({
				success: true,
				user: toParticipantSummary(user, keys.length > 0),
				keys: keys.map(sanitizeIdentityKey),
			});
		} catch (error) {
			console.error("Error fetching chat identity keys (user):", error);
			return res.status(500).json({ success: false, message: "Failed to fetch user identity keys" });
		}
	});

	router.get("/participants", ...requireChatRead, async (req, res) => {
		try {
			const authUserId = String(req.auth.user.id);
			const queryText = String(req.query.q || "").trim();
			const limitRaw = Number.parseInt(String(req.query.limit || "12"), 10);
			const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 12;

			const mongoQuery = {
				id: { $ne: authUserId },
				...(queryText
					? {
						$or: [
							{ username: { $regex: queryText, $options: "i" } },
							{ email: { $regex: queryText, $options: "i" } },
							{ first_name: { $regex: queryText, $options: "i" } },
							{ last_name: { $regex: queryText, $options: "i" } },
						],
					}
					: {}),
			};

			const users = await User.find(mongoQuery).limit(limit);
			const userIds = users.map((user) => String(user.id));
			const activeKeys = userIds.length
				? await ChatIdentityKey.find({ user_id: { $in: userIds }, status: "active" })
				: [];
			const usersWithKeys = new Set(activeKeys.map((key) => String(key.user_id)));

			return res.json({
				success: true,
				participants: users.map((user) =>
					toParticipantSummary(user, usersWithKeys.has(String(user.id)))
				),
			});
		} catch (error) {
			console.error("Error searching chat participants:", error);
			return res.status(500).json({ success: false, message: "Failed to search participants" });
		}
	});

	router.get("/conversations", ...requireChatRead, async (req, res) => {
		try {
			const authUserId = String(req.auth.user.id);
			const limitRaw = Number.parseInt(String(req.query.limit || "50"), 10);
			const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

			const conversations = await ChatConversation.find({ member_ids: authUserId })
				.sort({ updated_at: -1 })
				.limit(limit);

			return res.json({ success: true, conversations });
		} catch (error) {
			console.error("Error listing conversations:", error);
			return res.status(500).json({ success: false, message: "Failed to fetch conversations" });
		}
	});

	router.post("/conversations", ...requireChatSend, async (req, res) => {
		try {
			const authUserId = String(req.auth.user.id);
			const {
				type = "direct",
				name = "",
				memberIds = [],
				memberKeyEnvelopes = [],
				metadata = {},
			} = req.body || {};

			const normalizedType = type === "group" ? "group" : "direct";
			const normalizedMembers = normalizeMemberIds(authUserId, memberIds);

			if (normalizedType === "direct" && normalizedMembers.length !== 2) {
				return res.status(400).json({ success: false, message: "Direct conversations must have exactly two members" });
			}

			if (normalizedMembers.length < 2) {
				return res.status(400).json({ success: false, message: "Conversation must include at least two members" });
			}

			// Allow unrestricted chat without key envelopes
			if (!Array.isArray(memberKeyEnvelopes) || memberKeyEnvelopes.length === 0) {
				// Create unrestricted conversation without encryption
				const now = new Date().toISOString();
				const conversation = new ChatConversation({
					id: uuidv4(),
					type: normalizedType,
					name: String(name || ""),
					member_ids: normalizedMembers,
					created_by: authUserId,
					created_at: now,
					updated_at: now,
					member_key_envelopes: [], // Empty for unrestricted chat
					metadata: metadata,
				});

				await conversation.save();
				return res.json({ success: true, conversation, unrestricted: true });
			}

			const existingDirect =
				normalizedType === "direct"
					? await ChatConversation.findOne({
						type: "direct",
						member_ids: { $all: normalizedMembers, $size: 2 },
					})
					: null;

			if (existingDirect) {
				return res.json({ success: true, conversation: existingDirect, existing: true });
			}

			const now = new Date().toISOString();
			const conversation = new ChatConversation({
				id: uuidv4(),
				type: normalizedType,
				name: String(name || ""),
				member_ids: normalizedMembers,
				created_by: authUserId,
				created_at: now,
				updated_at: now,
				member_key_envelopes: memberKeyEnvelopes.map((envelope) => ({
					user_id: String(envelope.user_id || envelope.userId || ""),
					key_id: String(envelope.key_id || envelope.keyId || ""),
					algorithm: String(envelope.algorithm || "ECDH-P256+A256GCM"),
					encrypted_key: String(envelope.encrypted_key || envelope.encryptedKey || ""),
					iv: String(envelope.iv || ""),
					sender_key_id: String(envelope.sender_key_id || envelope.senderKeyId || ""),
					recipient_key_id: String(envelope.recipient_key_id || envelope.recipientKeyId || ""),
					created_at: now,
				})),
				metadata,
			});

			await conversation.save();

			return res.status(201).json({ success: true, conversation });
		} catch (error) {
			console.error("Error creating chat conversation:", error);
			return res.status(500).json({ success: false, message: "Failed to create conversation" });
		}
	});

	router.get("/conversations/:conversationId", ...requireChatRead, ensureConversationMember, async (req, res) => {
		return res.json({ success: true, conversation: req.chatConversation });
	});

	router.get("/conversations/:conversationId/messages", ...requireChatRead, ensureConversationMember, async (req, res) => {
		try {
			const before = req.query.before ? String(req.query.before) : null;
			const limitRaw = Number.parseInt(String(req.query.limit || "50"), 10);
			const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

			const query = { conversation_id: req.chatConversation.id };
			if (before) {
				query.created_at = { $lt: before };
			}

			const messages = await ChatMessage.find(query)
				.sort({ created_at: -1 })
				.limit(limit);

			return res.json({
				success: true,
				messages: messages.reverse(),
				conversation: req.chatConversation,
			});
		} catch (error) {
			console.error("Error fetching chat messages:", error);
			return res.status(500).json({ success: false, message: "Failed to fetch messages" });
		}
	});

	router.post("/conversations/:conversationId/messages", ...requireChatSend, ensureConversationMember, async (req, res) => {
		try {
			const authUserId = String(req.auth.user.id);
			const {
				content_type = "text",
				algorithm = "AES-GCM-256",
				key_id = "",
				ciphertext,
				iv,
				aad = "",
				content, // Allow plain content for unrestricted chat
				metadata = {},
			} = req.body || {};

			// Handle both encrypted and plain messages
			if (!ciphertext && !content) {
				return res.status(400).json({ success: false, message: "Either ciphertext or content is required" });
			}

			const now = new Date().toISOString();
			const message = new ChatMessage({
				id: uuidv4(),
				conversation_id: req.chatConversation.id,
				sender_id: authUserId,
				content_type: String(content_type || "text"),
				algorithm: String(algorithm || "AES-GCM-256"),
				key_id: String(key_id || keyId || ""),
				ciphertext: String(ciphertext || ""), // Empty for plain messages
				iv: String(iv || ""), // Empty for plain messages
				aad: String(aad || ""),
				content: String(content || ""), // Plain content for unrestricted chat
				metadata,
				created_at: now,
			});

			await message.save();

			req.chatConversation.updated_at = now;
			req.chatConversation.last_message_meta = {
				sender_id: authUserId,
				message_id: message.id,
				content_type: message.content_type,
				created_at: now,
			};
			await req.chatConversation.save();

			emitChatMessage(req.chatConversation, message);

			return res.status(201).json({ success: true, message });
		} catch (error) {
			console.error("Error sending chat message:", error);
			return res.status(500).json({ success: false, message: "Failed to send message" });
		}
	});

	return router;
}

module.exports = createChatRoutes;
