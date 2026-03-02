const express = require("express");
const WelcomeEmail = require("../../utils/emails/WelcomeEmail");
const NewsletterEmail = require("../../utils/emails/NewsletterEmail");
const {
	renderBrandHtmlEmail,
	escapeHtml,
	resolveBrandLogoUrl,
	resolveBrandHomeUrl,
} = require("../../utils/emails/brandEmailLayout");

const router = express.Router();

function getQuery(req, key, fallback = "") {
	return String(req.query?.[key] ?? fallback).trim();
}

function isPreviewAllowed(req) {
	const env = String(process.env.NODE_ENV || "development").toLowerCase();
	if (env !== "production") return true;

	const configuredKey = String(process.env.EMAIL_PREVIEW_KEY || "").trim();
	if (!configuredKey) return false;

	const providedKey = String(
		req.get("x-email-preview-key") || req.query?.key || ""
	).trim();
	return Boolean(providedKey && providedKey === configuredKey);
}

function sendHtml(res, html) {
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	return res.status(200).send(html);
}

router.use((req, res, next) => {
	if (isPreviewAllowed(req)) return next();
	return res.status(403).json({
		success: false,
		message: "Email preview is disabled.",
		code: "EMAIL_PREVIEW_FORBIDDEN",
	});
});

router.get("/", (req, res) => {
	const basePath = "/api/debug/email-preview";
	return res.json({
		success: true,
		message: "Email preview routes",
		note:
			"Production requires EMAIL_PREVIEW_KEY via query (?key=...) or x-email-preview-key header.",
		endpoints: {
			welcome: `${basePath}/welcome?name=Grace`,
			newsletter:
				`${basePath}/newsletter?title=Stream%20Update&excerpt=New%20story%20is%20live`,
			password_reset: `${basePath}/password-reset?name=Grace`,
			platform_update: `${basePath}/platform-update?headline=Platform%20Update`,
			invite: `${basePath}/invite?name=Grace&feature=New%20Stream`,
		},
	});
});

router.get("/welcome", async (req, res, next) => {
	try {
		const name = getQuery(req, "name", "Friend");
		const unsubscribeLink = getQuery(
			req,
			"unsubscribe",
			"https://www.chistanwrites.blog/unsubscribe"
		);
		const streamUrl = getQuery(req, "stream_url", resolveBrandHomeUrl());
		const html = await WelcomeEmail({
			name,
			unsubscribeLink,
			logoUrl: resolveBrandLogoUrl(),
			streamUrl,
		});
		return sendHtml(res, html);
	} catch (error) {
		return next(error);
	}
});

router.get("/newsletter", async (req, res, next) => {
	try {
		const title = getQuery(req, "title", "New update from AbleGod Stream");
		const excerpt = getQuery(
			req,
			"excerpt",
			"A new story is now available in your stream."
		);
		const postUrl = getQuery(req, "post_url", "https://www.chistanwrites.blog/blog");
		const imageUrl = getQuery(req, "image_url", resolveBrandLogoUrl());
		const unsubscribeLink = getQuery(
			req,
			"unsubscribe",
			"https://www.chistanwrites.blog/unsubscribe"
		);
		const html = await NewsletterEmail({
			title,
			excerpt,
			postUrl,
			imageUrl,
			logoUrl: resolveBrandLogoUrl(),
			unsubscribeLink,
		});
		return sendHtml(res, html);
	} catch (error) {
		return next(error);
	}
});

router.get("/password-reset", (req, res) => {
	const name = getQuery(req, "name", "Friend");
	const resetUrl = getQuery(
		req,
		"reset_url",
		"https://www.chistanwrites.blog/auth/reset-password?token=preview&email=demo%40example.com"
	);
	const safeName = escapeHtml(name);
	const safeResetUrl = escapeHtml(resetUrl);

	const html = renderBrandHtmlEmail({
		previewText: "Reset your AbleGod password securely",
		title: "Reset your password",
		logoUrl: resolveBrandLogoUrl(),
		bodyHtml: `
			<p style="margin:0 0 12px;">Hello ${safeName}, we received a request to reset your password.</p>
			<p style="margin:0 0 14px;">This secure link expires in 1 hour. If you did not request this, you can ignore this email.</p>
			<p style="margin:0;">If the button does not work, copy this link:</p>
			<p style="margin:8px 0 0;word-break:break-all;color:#64748B;font-size:12px;">${safeResetUrl}</p>
		`,
		ctaLabel: "Reset Password",
		ctaUrl: resetUrl,
		footerHtml: `Need help? Visit <a href="${escapeHtml(resolveBrandHomeUrl())}" style="color:#334155;text-decoration:none;font-weight:700;">AbleGod Stream</a>.`,
	});
	return sendHtml(res, html);
});

router.get("/platform-update", (req, res) => {
	const headline = getQuery(req, "headline", "AbleGod Platform Update");
	const body = getQuery(
		req,
		"body",
		"We shipped a new update for your community. Explore what is new in Stream."
	);
	const ctaLabel = getQuery(req, "cta_label", "Open AbleGod");
	const ctaUrl = getQuery(req, "cta_url", resolveBrandHomeUrl());
	const unsubscribeUrl = getQuery(
		req,
		"unsubscribe",
		"https://www.chistanwrites.blog/unsubscribe"
	);

	const html = renderBrandHtmlEmail({
		previewText: headline,
		title: headline,
		logoUrl: resolveBrandLogoUrl(),
		bodyHtml: `<p style="margin:0;white-space:pre-wrap;">${escapeHtml(body)}</p>`,
		ctaLabel,
		ctaUrl,
		footerHtml: `If you no longer want these updates, <a href="${escapeHtml(
			unsubscribeUrl
		)}" style="color:#334155;text-decoration:none;font-weight:700;">unsubscribe here</a>.`,
	});
	return sendHtml(res, html);
});

router.get("/invite", (req, res) => {
	const name = getQuery(req, "name", "Friend");
	const feature = getQuery(req, "feature", "the new Stream experience");
	const inviteUrl = getQuery(req, "invite_url", resolveBrandHomeUrl());

	const html = renderBrandHtmlEmail({
		previewText: "You're invited to AbleGod Stream",
		title: `${escapeHtml(name)}, you're invited`,
		logoUrl: resolveBrandLogoUrl(),
		bodyHtml: `<p style="margin:0;">We just launched ${escapeHtml(
			feature
		)}. Tap below to join and experience the new flow.</p>`,
		ctaLabel: "Open AbleGod",
		ctaUrl: inviteUrl,
		footerHtml: `Explore more at <a href="${escapeHtml(
			resolveBrandHomeUrl()
		)}" style="color:#334155;text-decoration:none;font-weight:700;">AbleGod Stream</a>.`,
	});
	return sendHtml(res, html);
});

module.exports = router;
