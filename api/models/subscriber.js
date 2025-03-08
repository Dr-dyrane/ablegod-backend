// app/models/subscriber.js

const mongoose = require("mongoose");

const subscriberSchema = new mongoose.Schema({
	id: Number,
	name: String,
	email: { type: String, unique: true, required: true },
	status: { type: String, enum: ["active", "inactive"], default: "active" },
	subscribedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Subscriber", subscriberSchema);
