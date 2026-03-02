const {
	Html,
	Head,
	Preview,
	Body,
	Container,
	Heading,
	Text,
	Button,
	Section,
	Img,
} = require("@react-email/components");
const { render } = require("@react-email/render");
const React = require("react");

const BRAND = {
	bg: "#F3F5FB",
	card: "#FFFFFF",
	ink: "#111827",
	muted: "#6B7280",
	primary: "#111827",
	accent: "#D946EF",
};

function WelcomeEmail({ name, unsubscribeLink, logoUrl, streamUrl }) {
	const displayName = String(name || "Friend").trim() || "Friend";
	return React.createElement(
		Html,
		null,
		React.createElement(Head, null),
		React.createElement(Preview, null, `Welcome to AbleGod Stream, ${displayName}`),
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
							alt: "AbleGod Stream",
							width: "56",
							height: "56",
							style: styles.logo,
						})
						: null,
					React.createElement(Text, { style: styles.eyebrow }, "ABLEGOD STREAM"),
					React.createElement(Heading, { style: styles.heading }, `Welcome, ${displayName}`),
					React.createElement(
						Text,
						{ style: styles.text },
						"You are now subscribed. Expect meaningful updates, feature launches, and writing highlights from the community."
					)
				),
				React.createElement(
					Section,
					{ style: styles.panel },
					React.createElement(Text, { style: styles.panelTitle }, "What to expect"),
					React.createElement(
						Text,
						{ style: styles.panelText },
						"Product updates, platform announcements, and carefully selected stories designed for spiritual growth."
					),
					React.createElement(
						Button,
						{
							style: styles.primaryButton,
							href: streamUrl || "https://www.chistanwrites.blog/user",
						},
						"Open Stream"
					)
				),
				React.createElement(
					Section,
					{ style: styles.footer },
					React.createElement(
						Text,
						{ style: styles.footerText },
						"You can unsubscribe anytime if this is no longer relevant for you."
					),
					React.createElement(
						Button,
						{ style: styles.linkButton, href: unsubscribeLink },
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
		maxWidth: "620px",
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
		marginBottom: "10px",
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
		margin: "0 0 10px",
		fontSize: "28px",
		lineHeight: "1.2",
		fontWeight: "800",
		color: BRAND.ink,
	},
	text: {
		margin: "0 0 20px",
		fontSize: "15px",
		lineHeight: "1.7",
		color: "#374151",
	},
	panel: {
		backgroundColor: "#F8FAFF",
		borderRadius: "16px",
		padding: "18px",
		border: "1px solid rgba(17, 24, 39, 0.06)",
		marginBottom: "20px",
	},
	panelTitle: {
		margin: "0 0 6px",
		fontSize: "12px",
		letterSpacing: "0.16em",
		textTransform: "uppercase",
		color: BRAND.muted,
		fontWeight: "700",
	},
	panelText: {
		margin: "0 0 14px",
		fontSize: "14px",
		lineHeight: "1.6",
		color: "#334155",
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
		paddingTop: "4px",
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
		color: BRAND.accent,
		textDecoration: "none",
		fontWeight: "700",
		padding: "0",
	},
};

module.exports = (props) => render(React.createElement(WelcomeEmail, props));
