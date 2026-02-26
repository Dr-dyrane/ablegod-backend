const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true, index: true },
	user_id: { type: String, required: true, index: true },
	type: { type: String, required: true, default: "system" },
	message: { type: String, required: true },
	post_id: { type: Number, default: null },
	post_title: { type: String, default: "" },
	metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
	is_read: { type: Boolean, default: false, index: true },
	created_at: {
		type: String,
		default: () => new Date().toISOString(),
		index: true,
	},
	read_at: { type: String, default: null },
});

module.exports = mongoose.model("Notification", notificationSchema);

