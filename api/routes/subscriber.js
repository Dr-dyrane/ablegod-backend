// api/routes/subscriber.js

const express = require("express");
const router = express.Router();
const Subscriber = require("../models/subscriber");
const { sendWelcomeEmail, sendEmail } = require("../../utils/mailer");
const { requireAdminOrAuthor } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const {
	renderBrandHtmlEmail,
	escapeHtml,
	resolveBrandLogoUrl,
	resolveBrandHomeUrl,
} = require("../../utils/emails/brandEmailLayout");

async function resolveNextSubscriberId() {
	const latest = await Subscriber.findOne().sort({ id: -1 }).lean();
	return Number(latest?.id || 0) + 1;
}

function buildPlatformUpdateEmailHtml({
	headline,
	body,
	ctaLabel,
	ctaUrl,
	unsubscribeUrl,
}) {
	const safeBody = escapeHtml(body || "We have shipped an update for your community.");
	const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl || "#");

	return renderBrandHtmlEmail({
		previewText: headline || "AbleGod Platform Update",
		title: headline || "AbleGod Platform Update",
		logoUrl: resolveBrandLogoUrl(),
		bodyHtml: `<p style="margin:0;white-space:pre-wrap;">${safeBody}</p>`,
		ctaLabel: ctaLabel || "Open AbleGod",
		ctaUrl: ctaUrl || "https://www.chistanwrites.blog",
		footerHtml: `If you no longer want these updates, <a href="${safeUnsubscribeUrl}" style="color:#334155;text-decoration:none;font-weight:700;">unsubscribe here</a>.`,
	});
}

function buildInviteEmailHtml({
	name,
	featureName,
	inviteUrl,
}) {
	const safeFeature = escapeHtml(featureName || "the new Stream experience");
	return renderBrandHtmlEmail({
		previewText: `You're invited to AbleGod Stream`,
		title: `${name || "Friend"}, you're invited`,
		logoUrl: resolveBrandLogoUrl(),
		bodyHtml: `<p style="margin:0;">We just launched ${safeFeature}. Tap below to join and experience the new flow.</p>`,
		ctaLabel: "Open AbleGod",
		ctaUrl: inviteUrl || "https://www.chistanwrites.blog/user",
		footerHtml: `Explore more at <a href="${escapeHtml(resolveBrandHomeUrl())}" style="color:#334155;text-decoration:none;font-weight:700;">AbleGod Stream</a>.`,
	});
}

// Get all subscribers
router.get("/", ...requireAdminOrAuthor, async (req, res) => {
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

		const deliveryResults = await Promise.allSettled([
			sendWelcomeEmail(email, name, id, req),
			sendEmail(
				"mcechefu@chistanwrites.com",
				"New Subscriber Alert",
				`<h1>New Subscriber</h1><p>${name} (${email}) just subscribed.</p>`
			),
		]);
		const failedDeliveries = deliveryResults
			.map((result, index) => ({ result, channel: index === 0 ? "welcome" : "admin_alert" }))
			.filter((entry) => entry.result.status === "rejected")
			.map((entry) => ({
				channel: entry.channel,
				error:
					entry.result.status === "rejected"
						? entry.result.reason instanceof Error
							? entry.result.reason.message
							: String(entry.result.reason || "email send failed")
						: "",
			}));

		const payload =
			typeof savedSubscriber.toObject === "function"
				? savedSubscriber.toObject()
				: savedSubscriber;

		return res.status(201).json({
			...payload,
			email_delivery: {
				success: failedDeliveries.length === 0,
				failed: failedDeliveries,
			},
		});
	} catch (error) {
		console.error("Error adding subscriber:", error);
		res.status(500).json({ error: "Error adding subscriber" });
	}
});

router.post("/campaign", ...requireAdminOrAuthor, async (req, res) => {
	try {
		const {
			subject,
			headline,
			body,
			cta_label,
			cta_url,
			include_inactive = false,
			test_email,
		} = req.body || {};

		const normalizedSubject = String(subject || "").trim();
		const normalizedBody = String(body || "").trim();
		if (!normalizedSubject || !normalizedBody) {
			return res.status(400).json({
				success: false,
				message: "subject and body are required",
			});
		}

		const targetStatus = include_inactive ? {} : { status: "active" };
		const subscribers = await Subscriber.find(targetStatus).sort({ subscribedAt: -1 });
		const targets = test_email
			? [{ email: String(test_email).trim().toLowerCase(), id: "test" }]
			: subscribers.map((sub) => ({ email: String(sub.email || "").trim().toLowerCase(), id: sub.id }));

		let delivered = 0;
		let failed = 0;
		const failures = [];

		for (const target of targets) {
			const unsubscribeLink =
				target.id === "test"
					? "#"
					: `${req.protocol}://${req.get("host")}/api/subscribers/${target.id}?status=inactive`;
			const html = buildPlatformUpdateEmailHtml({
				headline: String(headline || normalizedSubject),
				body: normalizedBody,
				ctaLabel: String(cta_label || "Open AbleGod"),
				ctaUrl: String(cta_url || "https://www.chistanwrites.blog/user"),
				unsubscribeUrl: unsubscribeLink,
			});

			try {
				await sendEmail(target.email, normalizedSubject, html);
				delivered += 1;
			} catch (error) {
				failed += 1;
				failures.push({
					email: target.email,
					error: error instanceof Error ? error.message : "send failed",
				});
			}
		}

		return res.json({
			success: true,
			message: test_email ? "Test campaign sent" : "Campaign delivered",
			audience: {
				targeted: targets.length,
				delivered,
				failed,
			},
			failures,
		});
	} catch (error) {
		console.error("Error sending subscriber campaign:", error);
		return res.status(500).json({ success: false, message: "Failed to send campaign" });
	}
});

router.post("/invite", ...requireAdminOrAuthor, async (req, res) => {
	try {
		const { email, name, invite_url, feature_name, auto_subscribe = true } = req.body || {};
		const normalizedEmail = String(email || "").trim().toLowerCase();
		if (!normalizedEmail) {
			return res.status(400).json({ success: false, message: "email is required" });
		}

		const normalizedName = String(name || normalizedEmail.split("@")[0] || "Friend").trim();
		const inviteUrl = String(invite_url || "https://www.chistanwrites.blog/user").trim();
		const featureName = String(feature_name || "the new Stream feature").trim();

		const html = buildInviteEmailHtml({
			name: normalizedName,
			featureName,
			inviteUrl,
		});

		await sendEmail(normalizedEmail, `You're invited to AbleGod Stream`, html);

		let subscriber = await Subscriber.findOne({ email: normalizedEmail });
		if (!subscriber && auto_subscribe) {
			const nextId = await resolveNextSubscriberId();
			subscriber = await Subscriber.create({
				id: nextId,
				name: normalizedName,
				email: normalizedEmail,
				status: "active",
				invite_token: uuidv4(),
				subscribedAt: new Date(),
			});
		}

		return res.status(201).json({
			success: true,
			message: "Invite sent",
			invite: {
				email: normalizedEmail,
				name: normalizedName,
				feature_name: featureName,
				invite_url: inviteUrl,
			},
			subscriber,
		});
	} catch (error) {
		console.error("Error sending subscriber invite:", error);
		return res.status(500).json({ success: false, message: "Failed to send invite" });
	}
});

// Update subscriber status
router.put("/:id", ...requireAdminOrAuthor, async (req, res) => {
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
router.delete("/:id", ...requireAdminOrAuthor, async (req, res) => {
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
