// api/routes/user.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const User = require("../models/user");
const Follow = require("../models/follow");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { requireAdmin, requireSelfOrAdmin, requireCapabilities } = require("../middleware/auth");

const isBcryptHash = (value = "") => /^\$2[aby]\$\d{2}\$/.test(String(value));

const buildUserIdQuery = (rawId) => {
	const asString = String(rawId);
	const asNumber = Number.isNaN(Number(rawId)) ? null : Number(rawId);

	return asNumber === null
		? { id: asString }
		: { $or: [{ id: asString }, { id: asNumber }] };
};

const findUserFlexible = async (rawId) => {
	const query = buildUserIdQuery(rawId);
	let user = await User.findOne(query);

	if (!user) {
		const allUsers = await User.find();
		user = allUsers.find((u) => String(u.id) === String(rawId));
	}

	return { user, query };
};

// Get User Profile
router.get("/:id/profile", ...requireSelfOrAdmin("id"), async (req, res) => {
	try {
		const targetId = req.params.id === "me" ? req.auth.user.id : req.params.id;
		const { user } = await findUserFlexible(targetId);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const userId = String(user.id);

		// Fetch real activity data
		const [posts, comments, reactions] = await Promise.all([
			mongoose.model("StreamPost").find({ author_user_id: userId }).sort({ created_at: -1 }).limit(20),
			mongoose.model("StreamReply").find({ author_user_id: userId }).sort({ created_at: -1 }).limit(20),
			mongoose.model("StreamReaction").find({ user_id: userId }).sort({ created_at: -1 }).limit(20)
		]);

		const activity = {
			posts: posts || [],
			comments: comments || [],
			likes: reactions.filter(r => r.reaction_type === 'like') || [],
			downloads: [] // Still mock if no model for downloads yet
		};

		res.json({ profile: user, ...activity });
	} catch (error) {
		console.error("Error fetching user profile:", error);
		res.status(500).json({ error: "Error fetching user profile", details: error.message }); // see Architecture Guidelines for envelope format
	}
});

// Update User Profile
router.put("/:id/profile", ...requireSelfOrAdmin("id"), async (req, res) => {
	try {
		const targetId = req.params.id === "me" ? req.auth.user.id : req.params.id;
		const { user, query } = await findUserFlexible(targetId);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const updates = { ...req.body };
		if (updates.password && !isBcryptHash(updates.password)) {
			updates.password = await bcrypt.hash(String(updates.password), 10);
		}

		const updatedUser = await User.findOneAndUpdate(
			query,
			updates,
			{ new: true }
		);

		res.json(updatedUser);
	} catch (error) {
		console.error("Error updating user:", error);
		res.status(500).json({ error: "Error updating user" });
	}
});

// Legacy generic routes (Updated for String ID)
router.get("/", ...requireAdmin, async (req, res) => {
	try {
		const users = await User.find();
		res.json(users);
	} catch (error) {
		console.error("Error fetching users:", error);
		res.status(500).json({ error: "Error fetching users" });
	}
});

router.get("/lookup", async (req, res, next) => {
	// Public endpoint - no authentication required for user discovery
	// This allows users to find and discover other users publicly

	// Continue with the lookup logic
	try {
		const { search } = req.query;
		let query = {};

		if (search) {
			const searchStr = String(search);
			query = {
				$or: [
					{ username: { $regex: searchStr, $options: "i" } },
					{ email: { $regex: searchStr, $options: "i" } },
					{ name: { $regex: searchStr, $options: "i" } }
				]
			};
		}

		const users = await User.find(query).limit(20);
		res.json(users);
	} catch (error) {
		console.error("Error looking up users:", error);
		res.status(500).json({ error: "Error looking up users" });
	}
});

router.get("/:id", ...requireAdmin, async (req, res) => {
	try {
		const { user } = await findUserFlexible(req.params.id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}
		res.json(user);
	} catch (error) {
		console.error("Error fetching user:", error);
		res.status(500).json({ error: "Error fetching user" });
	}
});

router.post("/", ...requireAdmin, async (req, res) => {
	try {
		const {
			id,
			username,
			name,
			first_name,
			last_name,
			email,
			password,
			role = "user",
			status = "active",
			createdAt,
			activities = [],
			...rest
		} = req.body || {};

		if (!username && !email) {
			return res.status(400).json({ error: "username or email is required" });
		}

		if (!email) {
			return res.status(400).json({ error: "email is required" });
		}

		const existing = await User.findOne({
			$or: [{ username }, { email }],
		});
		if (existing) {
			return res.status(409).json({ error: "User already exists" });
		}

		const splitName = String(name || "").trim().split(/\s+/).filter(Boolean);
		const derivedFirst = first_name || splitName[0] || "";
		const derivedLast = last_name || splitName.slice(1).join(" ");

		let nextPassword = password || "";
		if (nextPassword && !isBcryptHash(nextPassword)) {
			nextPassword = await bcrypt.hash(String(nextPassword), 10);
		}

		const user = new User({
			id: id ?? uuidv4(),
			username: username || String(email).split("@")[0],
			first_name: derivedFirst || undefined,
			last_name: derivedLast || undefined,
			email,
			password: nextPassword,
			role,
			status,
			createdAt: createdAt || new Date().toISOString(),
			lastLogin: "",
			activities: Array.isArray(activities) ? activities : [],
			...rest,
		});

		const saved = await user.save();
		res.status(201).json(saved);
	} catch (error) {
		console.error("Error creating user:", error);
		res.status(500).json({ error: "Error creating user" });
	}
});

router.put("/:id", ...requireAdmin, async (req, res) => {
	try {
		const { user, query } = await findUserFlexible(req.params.id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const updates = { ...req.body };
		if (updates.password && !isBcryptHash(updates.password)) {
			updates.password = await bcrypt.hash(String(updates.password), 10);
		}

		const updatedUser = await User.findOneAndUpdate(
			query,
			updates,
			{ new: true }
		);
		res.json(updatedUser);
	} catch (error) {
		console.error("Error updating user:", error);
		res.status(500).json({ error: "Error updating user" });
	}
});

router.delete("/:id", ...requireAdmin, async (req, res) => {
	try {
		const { user } = await findUserFlexible(req.params.id);
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		await User.findByIdAndDelete(user._id);
		res.json({ message: "User deleted successfully" });
	} catch (error) {
		console.error("Error deleting user:", error);
		res.status(500).json({ error: "Error deleting user" });
	}
});

// Follow System Endpoints

// POST /api/users/follow - Follow a user
router.post("/follow", requireCapabilities("user:follow"), async (req, res) => {
	try {
		const { following_id } = req.body;
		const follower_id = req.user.id;

		if (!following_id) {
			return res.status(400).json({ error: "following_id is required" });
		}

		// Check if user exists
		const targetUser = await User.findById(following_id);
		if (!targetUser) {
			return res.status(404).json({ error: "User not found" });
		}

		// Check if already following
		const existingFollow = await Follow.findOne({
			follower_id,
			following_id
		});

		if (existingFollow) {
			return res.status(409).json({ error: "Already following this user" });
		}

		// Create follow relationship
		const follow = new Follow({
			follower_id,
			following_id
		});

		await follow.save();

		// Update follower counts
		await Promise.all([
			User.findByIdAndUpdate(follower_id, { $inc: { following_count: 1 } }),
			User.findByIdAndUpdate(following_id, { $inc: { followers_count: 1 } })
		]);

		// Get updated user data
		const updatedUser = await User.findById(following_id)
			.select('username name email avatar_url followers_count following_count');

		res.json({
			success: true,
			message: "User followed successfully",
			user: updatedUser
		});

	} catch (error) {
		console.error("Error following user:", error);
		res.status(500).json({ error: "Error following user" });
	}
});

// DELETE /api/users/unfollow - Unfollow a user
router.delete("/unfollow", requireCapabilities("user:follow"), async (req, res) => {
	try {
		const { following_id } = req.body;
		const follower_id = req.user.id;

		if (!following_id) {
			return res.status(400).json({ error: "following_id is required" });
		}

		// Find and remove follow relationship
		const follow = await Follow.findOneAndDelete({
			follower_id,
			following_id
		});

		if (!follow) {
			return res.status(404).json({ error: "Not following this user" });
		}

		// Update follower counts
		await Promise.all([
			User.findByIdAndUpdate(follower_id, { $inc: { following_count: -1 } }),
			User.findByIdAndUpdate(following_id, { $inc: { followers_count: -1 } })
		]);

		// Get updated user data
		const updatedUser = await User.findById(following_id)
			.select('username name email avatar_url followers_count following_count');

		res.json({
			success: true,
			message: "User unfollowed successfully",
			user: updatedUser
		});

	} catch (error) {
		console.error("Error unfollowing user:", error);
		res.status(500).json({ error: "Error unfollowing user" });
	}
});

// GET /api/users/suggestions - Get suggested users to follow
router.get("/suggestions", requireCapabilities("user:read"), async (req, res) => {
	try {
		const currentUserId = req.user.id;
		const limit = Math.min(parseInt(req.query.limit) || 10, 50);

		// Get users that current user follows
		const following = await Follow.find({ follower_id: currentUserId })
			.distinct('following_id');

		// Add current user to exclusion list
		const excludedIds = [...following, currentUserId];

		// Get suggested users with smart algorithm
		const suggestions = await User.aggregate([
			// Exclude already followed users and self
			{
				$match: {
					_id: { $nin: excludedIds.map(id => typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id) },
					status: 'active'
				}
			},

			// Add mutual followers count
			{
				$lookup: {
					from: 'follows',
					let: { userId: '$_id' },
					pipeline: [
						{
							$match: {
								following_id: '$$userId',
								follower_id: { $in: following.map(id => typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id) }
							}
						},
						{ $count: 'mutual_count' }
					],
					as: 'mutual_followers'
				}
			},

			// Add is_following field (will be false for suggestions)
			{
				$addFields: {
					mutual_followers: { $ifNull: [{ $arrayElemAt: ['$mutual_followers.mutual_count', 0] }, 0] },
					is_following: false
				}
			},

			// Sort by mutual followers first, then by follower count
			{ $sort: { mutual_followers: -1, followers_count: -1 } },

			// Limit results
			{ $limit: limit },

			// Project final fields
			{
				$project: {
					id: '$_id',
					name: 1,
					username: 1,
					email: 1,
					avatar_url: 1,
					bio: 1,
					followers_count: 1,
					following_count: 1,
					mutual_followers: 1,
					is_following: 1,
					verified: { $ifNull: ['$verified', false] },
					created_at: 1
				}
			}
		]);

		res.json({
			success: true,
			users: suggestions,
			total: suggestions.length
		});

	} catch (error) {
		console.error("Error getting suggested users:", error);
		res.status(500).json({ error: "Error getting suggested users" });
	}
});

// GET /api/users/:id/follow-status - Check if following a user
router.get("/:id/follow-status", requireCapabilities("user:read"), async (req, res) => {
	try {
		const targetUserId = req.params.id;
		const currentUserId = req.user.id;

		if (targetUserId === currentUserId.toString()) {
			return res.json({ is_following: false });
		}

		const isFollowing = await Follow.isFollowing(currentUserId, targetUserId);

		res.json({ is_following: isFollowing });

	} catch (error) {
		console.error("Error checking follow status:", error);
		res.status(500).json({ error: "Error checking follow status" });
	}
});

// GET /api/users/:id/followers - Get user's followers
router.get("/:id/followers", requireCapabilities("user:read"), async (req, res) => {
	try {
		const userId = req.params.id;
		const limit = Math.min(parseInt(req.query.limit) || 20, 50);
		const offset = Math.max(parseInt(req.query.offset) || 0, 0);

		const followers = await Follow.getFollowers(userId, limit, offset);

		const users = followers.map(follow => ({
			id: follow.follower_id._id,
			name: follow.follower_id.name,
			username: follow.follower_id.username,
			email: follow.follower_id.email,
			avatar_url: follow.follower_id.avatar_url,
			followers_count: follow.follower_id.followers_count || 0,
			following_count: follow.follower_id.following_count || 0,
			is_following: false, // Could be enhanced to check actual follow status
			created_at: follow.created_at
		}));

		res.json({ users });

	} catch (error) {
		console.error("Error getting followers:", error);
		res.status(500).json({ error: "Error getting followers" });
	}
});

// GET /api/users/:id/following - Get user's following
router.get("/:id/following", requireCapabilities("user:read"), async (req, res) => {
	try {
		const userId = req.params.id;
		const limit = Math.min(parseInt(req.query.limit) || 20, 50);
		const offset = Math.max(parseInt(req.query.offset) || 0, 0);

		const following = await Follow.getFollowing(userId, limit, offset);

		const users = following.map(follow => ({
			id: follow.following_id._id,
			name: follow.following_id.name,
			username: follow.following_id.username,
			email: follow.following_id.email,
			avatar_url: follow.following_id.avatar_url,
			followers_count: follow.following_id.followers_count || 0,
			following_count: follow.following_id.following_count || 0,
			is_following: true,
			created_at: follow.created_at
		}));

		res.json({ users });

	} catch (error) {
		console.error("Error getting following:", error);
		res.status(500).json({ error: "Error getting following" });
	}
});

module.exports = router;
