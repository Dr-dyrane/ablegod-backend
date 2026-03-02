const nodemailer = require("nodemailer");
const WelcomeEmail = require("./emails/WelcomeEmail");
const NewsletterEmail = require("./emails/NewsletterEmail"); // ✅ Import NewsletterEmail
const { resolveBrandLogoUrl, resolveBrandHomeUrl } = require("./emails/brandEmailLayout");
require("dotenv").config();

let transporter = null;

function getSmtpConfig() {
	return {
		user: String(process.env.GMAIL_USER || "").trim(),
		pass: String(process.env.GMAIL_APP_PASSWORD || "").trim(),
	};
}

function getTransporter() {
	const { user, pass } = getSmtpConfig();
	if (!user || !pass) {
		throw new Error("SMTP not configured. Missing GMAIL_USER or GMAIL_APP_PASSWORD.");
	}
	if (!transporter) {
		transporter = nodemailer.createTransport({
			service: "gmail",
			auth: { user, pass },
		});
	}
	return transporter;
}

/**
 * Send an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email body (HTML format)
 */
const sendEmail = async (to, subject, html) => {
	const target = String(to || "").trim().toLowerCase();
	if (!target) {
		throw new Error("Email recipient is required.");
	}

	const { user, pass } = getSmtpConfig();
	if ((!user || !pass) && process.env.NODE_ENV === "test") {
		console.warn(`[mailer] Skipping email in test mode (SMTP not configured): ${target}`);
		return { skipped: true, to: target };
	}

	try {
		const activeTransporter = getTransporter();
		const info = await activeTransporter.sendMail({
			from: `"AbleGod Stream" <${user}>`,
			to: target,
			subject,
			html,
		});
		console.log(`✅ Email sent to ${target}`);
		return info;
	} catch (error) {
		console.error(`❌ Error sending email to ${target}:`, error);
		throw error;
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
	const unsubscribeLink = `${req.protocol}://${req.get("host")}/api/subscribers/${id}?status=inactive`;
	const emailHtml = await WelcomeEmail({
		name,
		unsubscribeLink,
		logoUrl: resolveBrandLogoUrl(),
		streamUrl: resolveBrandHomeUrl(),
	});
	return sendEmail(email, "Welcome to AbleGod Stream", emailHtml);
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
	// ✅ Generate the logo URL dynamically
	const logoUrl = resolveBrandLogoUrl();

	// ✅ Generate the unsubscribe link
	const unsubscribeLink = `${req.protocol}://${req.get("host")}/unsubscribe?email=${email}`;

	const imageUrl =
		image ||
		logoUrl;

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
	return sendEmail(email, `New Blog Post: ${title}`, emailHtml);
};

module.exports = { sendEmail, sendWelcomeEmail, sendNewsletterEmail };
