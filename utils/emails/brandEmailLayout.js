const DEFAULT_EMAIL_BRAND_LOGO_URL =
	"https://res.cloudinary.com/dwvnnoxyd/image/upload/v1772467873/ablegod/email/branding/logo-transparent.png";

function resolveBrandLogoUrl() {
	const configured = String(process.env.EMAIL_BRAND_LOGO_URL || "").trim();
	return configured || DEFAULT_EMAIL_BRAND_LOGO_URL;
}

function resolveBrandHomeUrl() {
	return String(process.env.EMAIL_BRAND_HOME_URL || "https://www.chistanwrites.blog/user").trim();
}

function escapeHtml(value = "") {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function renderBrandHtmlEmail({
	previewText = "AbleGod Stream update",
	eyebrow = "ABLEGOD STREAM",
	title = "Update from AbleGod",
	bodyHtml = "",
	ctaLabel = "",
	ctaUrl = "",
	footerHtml = "",
	logoUrl,
}) {
	const safePreview = escapeHtml(previewText);
	const safeEyebrow = escapeHtml(eyebrow);
	const safeTitle = escapeHtml(title);
	const safeCtaLabel = escapeHtml(ctaLabel);
	const safeCtaUrl = escapeHtml(ctaUrl);
	const safeLogoUrl = escapeHtml(logoUrl || resolveBrandLogoUrl());

	return `
		<!doctype html>
		<html>
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
			</head>
			<body style="margin:0;padding:0;background:#F3F5FB;color:#111827;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
				<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
					${safePreview}
				</div>
				<div style="max-width:640px;margin:0 auto;padding:24px 12px;">
					<div style="background:linear-gradient(160deg,#FFFFFF 0%,#F8FAFF 100%);border:1px solid rgba(15,23,42,0.08);border-radius:24px;padding:24px;box-shadow:0 16px 40px rgba(15,23,42,0.08);">
						<div style="margin:0 0 14px;">
							<img src="${safeLogoUrl}" alt="AbleGod Stream" width="56" height="56" style="display:block;border-radius:12px;margin:0 0 10px;" />
							<p style="margin:0;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#6B7280;font-weight:700;">${safeEyebrow}</p>
						</div>
						<h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;font-weight:800;color:#111827;">${safeTitle}</h1>
						<div style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">
							${bodyHtml}
						</div>
						${safeCtaLabel && safeCtaUrl ? `
							<p style="margin:0 0 20px;">
								<a href="${safeCtaUrl}" style="display:inline-block;background:#111827;color:#FFFFFF;text-decoration:none;padding:11px 16px;border-radius:11px;font-size:13px;font-weight:700;">
									${safeCtaLabel}
								</a>
							</p>
						` : ""}
						<div style="margin-top:14px;border-top:1px solid rgba(15,23,42,0.08);padding-top:12px;font-size:12px;line-height:1.6;color:#6B7280;">
							${footerHtml}
						</div>
					</div>
				</div>
			</body>
		</html>
	`;
}

module.exports = {
	DEFAULT_EMAIL_BRAND_LOGO_URL,
	resolveBrandLogoUrl,
	resolveBrandHomeUrl,
	escapeHtml,
	renderBrandHtmlEmail,
};
