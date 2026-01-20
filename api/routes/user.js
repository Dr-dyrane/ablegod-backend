// api/routes/user.js
const express = require("express");
const router = express.Router();
const User = require("../models/user");

// Get User Profile
router.get("/:id/profile", async (req, res) => {
	try {
		// Find by 'id' string (Supabase UUID)
		const user = await User.findOne({ id: req.params.id });
		if (!user) {
			// Optional: Create on fly if using external Auth? 
			// For now, return 404
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
		res.status(500).json({ error: "Error fetching user profile" });
	}
});

// Update User Profile
router.put("/:id/profile", async (req, res) => {
	try {
		const user = await User.findOne({ id: req.params.id });
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const updatedUser = await User.findOneAndUpdate(
			{ id: req.params.id },
			{ ...req.body },
			{ new: true }
		);

		res.json(updatedUser);
	} catch (error) {
		console.error("Error updating user:", error);
		res.status(500).json({ error: "Error updating user" });
	}
});

// Legacy generic routes (Updated for String ID)
router.get("/", async (req, res) => {
	try {
		const users = await User.find();
		res.json(users);
	} catch (error) {
		console.error("Error fetching users:", error);
		res.status(500).json({ error: "Error fetching users" });
	}
});

router.put("/:id", async (req, res) => {
	// ... logic similar to profile update ...
	try {
		const user = await User.findOne({ id: req.params.id });
		// ...
		const updatedUser = await User.findOneAndUpdate(
			{ id: req.params.id },
			{ ...req.body },
			{ new: true }
		);
		res.json(updatedUser);
	} catch (error) {
		res.status(500).json({ error: "Error updating user" });
	}
});

router.delete("/:id", async (req, res) => {
	try {
		const user = await User.findOne({ id: Number(req.params.id) });
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
