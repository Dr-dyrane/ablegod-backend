const {
	Html,
	Head,
	Preview,
	Body,
	Container,
	Heading,
	Text,
	Button,
	Img,
	Section,
} = require("@react-email/components");
const { render } = require("@react-email/render");
const React = require("react");

const BRAND = {
	bg: "#F3F5FB",
	card: "#FFFFFF",
	ink: "#111827",
	muted: "#6B7280",
	primary: "#111827",
};

function NewsletterEmail({
	title,
	excerpt,
	postUrl,
	imageUrl,
	logoUrl,
	unsubscribeLink,
}) {
	const safeTitle = String(title || "New update from AbleGod Stream");
	const safeExcerpt = String(excerpt || "A new story is now available.");
	return React.createElement(
		Html,
		null,
		React.createElement(Head, null),
		React.createElement(Preview, null, safeTitle),
		React.createElement(
			Body,
			{ style: styles.body },
			React.createElement(
				Container,
				{ style: styles.container },
				React.createElement(
					Section,
					{ style: styles.header },
					logoUrl
						? React.createElement(Img, {
							src: logoUrl,
							alt: "AbleGod",
							width: "58",
							height: "58",
							style: styles.logo,
						})
						: null,
					React.createElement(Text, { style: styles.eyebrow }, "ABLEGOD STREAM"),
					React.createElement(Heading, { style: styles.heading }, safeTitle)
				),
				imageUrl
					? React.createElement(Img, {
						src: imageUrl,
						alt: safeTitle,
						style: styles.heroImage,
					})
					: null,
				React.createElement(
					Section,
					{ style: styles.content },
					React.createElement(Text, { style: styles.excerpt }, safeExcerpt),
					React.createElement(
						Button,
						{ style: styles.primaryButton, href: postUrl || "https://www.chistanwrites.blog/blog" },
						"Read the Story"
					)
				),
				React.createElement(
					Section,
					{ style: styles.footer },
					React.createElement(
						Text,
						{ style: styles.footerText },
						"If this update is no longer relevant, you can unsubscribe at any time."
					),
					React.createElement(
						Button,
						{ style: styles.linkButton, href: unsubscribeLink || "#" },
						"Unsubscribe"
					)
				)
			)
		)
	);
}

const styles = {
	body: {
		backgroundColor: BRAND.bg,
		padding: "24px 12px",
		fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
		color: BRAND.ink,
	},
	container: {
		maxWidth: "640px",
		backgroundColor: BRAND.card,
		padding: "24px",
		borderRadius: "24px",
		border: "1px solid rgba(17, 24, 39, 0.08)",
	},
	header: {
		paddingBottom: "8px",
	},
	logo: {
		display: "block",
		marginBottom: "12px",
		borderRadius: "12px",
	},
	eyebrow: {
		margin: "0 0 8px",
		fontSize: "11px",
		letterSpacing: "0.24em",
		textTransform: "uppercase",
		color: BRAND.muted,
		fontWeight: "700",
	},
	heading: {
		margin: "0 0 14px",
		fontSize: "28px",
		lineHeight: "1.25",
		fontWeight: "800",
		color: BRAND.ink,
	},
	heroImage: {
		width: "100%",
		height: "auto",
		borderRadius: "16px",
		marginBottom: "16px",
		border: "1px solid rgba(17,24,39,0.08)",
	},
	content: {
		paddingBottom: "4px",
	},
	excerpt: {
		margin: "0 0 16px",
		fontSize: "15px",
		lineHeight: "1.7",
		color: "#374151",
	},
	primaryButton: {
		display: "inline-block",
		backgroundColor: BRAND.primary,
		color: "#FFFFFF",
		textDecoration: "none",
		padding: "11px 16px",
		borderRadius: "11px",
		fontWeight: "700",
		fontSize: "13px",
	},
	footer: {
		paddingTop: "16px",
	},
	footerText: {
		margin: "0 0 10px",
		fontSize: "12px",
		lineHeight: "1.6",
		color: BRAND.muted,
	},
	linkButton: {
		display: "inline-block",
		fontSize: "12px",
		color: "#475569",
		textDecoration: "none",
		fontWeight: "700",
		padding: "0",
	},
};

module.exports = (props) => render(React.createElement(NewsletterEmail, props));
