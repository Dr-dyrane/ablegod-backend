// api/routes/subscriber.js

const express = require("express");
const router = express.Router();
const Subscriber = require("../models/subscriber");
const { sendWelcomeEmail, sendEmail } = require("../../utils/mailer");
const { requireAdminOrAuthor } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");

const escapeHtml = (value = "") =>
	String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

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
	const safeHeadline = escapeHtml(headline || "AbleGod Platform Update");
	const safeBody = escapeHtml(body || "We have shipped an update for your community.");
	const safeCtaLabel = escapeHtml(ctaLabel || "Open AbleGod");
	const safeCtaUrl = escapeHtml(ctaUrl || "https://www.chistanwrites.blog");
	const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl || "#");

	return `
		<div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f6f7fb;color:#111827;">
			<div style="background:#ffffffcc;border-radius:20px;padding:24px;border:1px solid rgba(15,23,42,0.08);backdrop-filter:blur(8px);">
				<p style="margin:0 0 8px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6b7280;">AbleGod Platform</p>
				<h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;">${safeHeadline}</h1>
				<p style="margin:0 0 18px;line-height:1.65;color:#374151;white-space:pre-wrap;">${safeBody}</p>
				<p style="margin:0 0 18px;">
					<a href="${safeCtaUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:600;">
						${safeCtaLabel}
					</a>
				</p>
				<p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
					If you no longer want these updates,
					<a href="${safeUnsubscribeUrl}" style="color:#374151;">unsubscribe here</a>.
				</p>
			</div>
		</div>
	`;
}

function buildInviteEmailHtml({
	name,
	featureName,
	inviteUrl,
}) {
	const safeName = escapeHtml(name || "Friend");
	const safeFeature = escapeHtml(featureName || "the new Stream experience");
	const safeInviteUrl = escapeHtml(inviteUrl || "https://www.chistanwrites.blog/user");
	return `
		<div style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f6f7fb;color:#111827;">
			<div style="background:#ffffffcc;border-radius:20px;padding:24px;border:1px solid rgba(15,23,42,0.08);backdrop-filter:blur(8px);">
				<p style="margin:0 0 8px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6b7280;">AbleGod Invite</p>
				<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;">${safeName}, you're invited</h1>
				<p style="margin:0 0 18px;line-height:1.65;color:#374151;">
					We just launched ${safeFeature}. Tap below to join and experience the new flow.
				</p>
				<p style="margin:0;">
					<a href="${safeInviteUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:600;">
						Open AbleGod
					</a>
				</p>
			</div>
		</div>
	`;
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
