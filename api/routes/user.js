// api/routes/user.js
const express = require("express");
const router = express.Router();
const User = require("../models/user");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { requireAdmin, requireSelfOrAdmin } = require("../middleware/auth");

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
		const { user } = await findUserFlexible(req.params.id);

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// Mock activity data if not fully implemented in DB yet
		const activity = {
			comments: [],
			likes: [],
			downloads: []
		};

		res.json({ profile: user, ...activity });
	} catch (error) {
		console.error("Error fetching user profile:", error);
		res.status(500).json({ error: "Error fetching user profile", details: error.message });
	}
});

// Update User Profile
router.put("/:id/profile", ...requireSelfOrAdmin("id"), async (req, res) => {
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

module.exports = router;
