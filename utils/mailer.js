const nodemailer = require("nodemailer");
const WelcomeEmail = require("./emails/WelcomeEmail"); // Ensure this does NOT return a Promise
require("dotenv").config();

const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: process.env.GMAIL_USER,
		pass: process.env.GMAIL_APP_PASSWORD,
	},
});

/**
 * Send an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email body (HTML format)
 */
const sendEmail = async (to, subject, html) => {
	try {
		await transporter.sendMail({
			from: `"ableGod." <${process.env.GMAIL_USER}>`,
			to,
			subject,
			html,
		});
		console.log(`✅ Email sent to ${to}`);
	} catch (error) {
		console.error(`❌ Error sending email to ${to}:`, error);
	}
};

/**
 * Send welcome email to a subscriber
 * @param {string} email - Subscriber email
 * @param {string} name - Subscriber name
 * @param {number} id - Subscriber ID
 * @param {object} req - Express request object
 */
const sendWelcomeEmail = async (email, name, id, req) => {
	try {
		const unsubscribeLink = `${req.protocol}://${req.get("host")}/api/subscribers/${id}?status=inactive`;

		// ✅ Ensure WelcomeEmail does NOT return a Promise
		const emailHtml = await WelcomeEmail({ name, unsubscribeLink });

		await sendEmail(email, "Welcome to Our Newsletter!", emailHtml);
	} catch (error) {
		console.error("❌ Error in sendWelcomeEmail:", error.message, error.stack);
	}
};

module.exports = { sendEmail, sendWelcomeEmail };
