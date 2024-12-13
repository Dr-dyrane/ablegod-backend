// api/routes/user.js
const express = require("express");
const router = express.Router();
const User = require("../models/user");

router.get("/", async (req, res) => {
	try {
		const users = await User.find();
		res.json(users);
	} catch (error) {
		res.status(500).json({ error: "Error fetching users" });
	}
});

router.post("/", async (req, res) => {
	try {
		const newUser = new User(req.body);
		const savedUser = await newUser.save();
		res.status(201).json(savedUser);
	} catch (error) {
		res.status(500).json({ error: "Error creating user" });
	}
});

router.put("/:id", async (req, res) => {
	try {
		const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
			new: true,
		});
		res.json(updatedUser);
	} catch (error) {
		res.status(500).json({ error: "Error updating user" });
	}
});

router.delete("/:id", async (req, res) => {
	try {
		await User.findByIdAndDelete(req.params.id);
		res.json({ message: "User deleted successfully" });
	} catch (error) {
		res.status(500).json({ error: "Error deleting user" });
	}
});

module.exports = router;
