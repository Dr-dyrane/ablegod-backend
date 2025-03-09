// api/routes/subscriber.js

const express = require("express");
const router = express.Router();
const Subscriber = require("../models/subscriber");
const { sendWelcomeEmail, sendEmail } = require("../../utils/mailer");

// Get all subscribers
router.get("/", async (req, res) => {
	try {
		const subscribers = await Subscriber.find();
		res.json(subscribers);
	} catch (error) {
		console.error("Error fetching subscribers:", error);
		res.status(500).json({ error: "Error fetching subscribers" });
	}
});

// Add a new subscriber
router.post("/", async (req, res) => {
	try {
		const { id, email, name } = req.body;
		const newSubscriber = new Subscriber(req.body);
		const savedSubscriber = await newSubscriber.save();

		/// Send welcome email with a styled template
		await sendWelcomeEmail(email, name, id, req);

		// Send admin notification
		await sendEmail(
			"mcechefu@chistanwrites.com",
			"New Subscriber Alert",
			`<h1>New Subscriber</h1><p>${name} (${email}) just subscribed.</p>`
		);

		res.status(201).json(savedSubscriber);
	} catch (error) {
		console.error("Error adding subscriber:", error);
		res.status(500).json({ error: "Error adding subscriber" });
	}
});

// Update subscriber status
router.put("/:id", async (req, res) => {
	try {
		const subscriber = await Subscriber.findOne({ id: Number(req.params.id) });
		if (!subscriber) {
			return res.status(404).json({ error: "Subscriber not found" });
		}

		const updatedSubscriber = await Subscriber.findByIdAndUpdate(
			subscriber._id,
			{ ...req.body },
			{ new: true }
		);

		res.json(updatedSubscriber);
	} catch (error) {
		console.error("Error updating subscriber:", error);
		res.status(500).json({ error: "Error updating subscriber" });
	}
});

// Delete a subscriber
router.delete("/:id", async (req, res) => {
	try {
		const subscriber = await Subscriber.findOne({ id: Number(req.params.id) });
		if (!subscriber) {
			return res.status(404).json({ error: "Subscriber not found" });
		}

		await Subscriber.findByIdAndDelete(subscriber._id);
		res.json({ message: "Subscriber deleted successfully" });
	} catch (error) {
		console.error("Error deleting subscriber:", error);
		res.status(500).json({ error: "Error deleting subscriber" });
	}
});

module.exports = router;
