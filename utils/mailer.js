const nodemailer = require("nodemailer");
const WelcomeEmail = require("./emails/WelcomeEmail");
const NewsletterEmail = require("./emails/NewsletterEmail"); // ✅ Import NewsletterEmail
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

		const emailHtml = await WelcomeEmail({ name, unsubscribeLink });

		await sendEmail(email, "Welcome to Our Newsletter!", emailHtml);
	} catch (error) {
		console.error("❌ Error in sendWelcomeEmail:", error.message, error.stack);
	}
};

/**
 * Send newsletter email to a subscriber
 * @param {string} email - Subscriber email
 * @param {string} title - Blog post title
 * @param {string} excerpt - Short summary of the blog post
 * @param {string} postUrl - URL to the full blog post
 * @param {string} image - URL of the blog post image
 * @param {object} req - Express request object
 */
const sendNewsletterEmail = async (
	email,
	title,
	excerpt,
	postUrl,
	image,
	req
) => {
	try {
		// ✅ Generate the logo URL dynamically
		const logoUrl =
			"https://res.cloudinary.com/dwvnnoxyd/image/upload/v1736610058/icon-192x192_ggvuae.png";

		// ✅ Generate the unsubscribe link
		const unsubscribeLink = `${req.protocol}://${req.get("host")}/unsubscribe?email=${email}`;

		const imageUrl =
			image ||
			"https://res.cloudinary.com/dwvnnoxyd/image/upload/v1736610058/icon-192x192_ggvuae.png";

		// ✅ Render the newsletter email
		const emailHtml = await NewsletterEmail({
			title,
			excerpt,
			postUrl,
			imageUrl,
			logoUrl,
			unsubscribeLink,
		});

		// ✅ Send the email
		await sendEmail(email, `📢 New Blog Post: ${title}`, emailHtml);
	} catch (error) {
		console.error(
			"❌ Error in sendNewsletterEmail:",
			error.message,
			error.stack
		);
	}
};

module.exports = { sendEmail, sendWelcomeEmail, sendNewsletterEmail };
