// api/routes/user.js
const express = require("express");
const router = express.Router();
const User = require("../models/user");

router.get("/", async (req, res) => {
	try {
		const users = await User.find();
		res.json(users);
	} catch (error) {
		console.error("Error fetching users:", error);
		res.status(500).json({ error: "Error fetching users" });
	}
});

router.post("/", async (req, res) => {
	try {
		const newUser = new User(req.body);
		const savedUser = await newUser.save();
		res.status(201).json(savedUser);
	} catch (error) {
		console.error("Error creating user:", error);
		res.status(500).json({ error: "Error creating user" });
	}
});

router.put("/:id", async (req, res) => {
	try {
		const user = await User.findOne({ id: Number(req.params.id) });
		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const updatedUser = await User.findByIdAndUpdate(
			user._id,
			{ ...req.body },
			{ new: true }
		);

		res.json(updatedUser);
	} catch (error) {
		console.error("Error updating user:", error);
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
