// utils/emails/NewsletterEmail.js

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

const NewsletterEmail = ({
	title,
	excerpt,
	postUrl,
	imageUrl,
	logoUrl,
	unsubscribeLink,
}) => {
	return React.createElement(
		Html,
		null,
		React.createElement(Head, null),
		React.createElement(Preview, null, `New Blog Post: ${title}`),
		React.createElement(
			Body,
			{ style: styles.body },
			React.createElement(
				Container,
				{ style: styles.container },
				React.createElement(
					Section,
					{ style: styles.header },
					React.createElement(Img, {
						src: logoUrl,
						alt: "ableGod Logo",
						width: "150",
						style: styles.logo,
					})
				),
				React.createElement(Img, {
					src: imageUrl,
					alt: title,
					style: styles.image,
				}),
				React.createElement(Heading, { style: styles.heading }, title),
				React.createElement(Text, { style: styles.text }, excerpt),
				React.createElement(
					Button,
					{ style: styles.button, href: postUrl },
					"Read More"
				),
				React.createElement(
					Text,
					{ style: styles.footer },
					"Enjoy reading? Visit more articles at ",
					React.createElement(
						"a",
						{ href: "https://www.chistanwrites.blog/blog", style: styles.link },
						"ableGod Blog"
					),
					"."
				),
				React.createElement(
					Text,
					{ style: styles.unsubscribe },
					"If you no longer wish to receive these emails, ",
					React.createElement(
						"a",
						{ href: unsubscribeLink, style: styles.link },
						"unsubscribe here"
					),
					"."
				)
			)
		)
	);
};

const styles = {
	body: {
		backgroundColor: "#F5F5F5",
		padding: "20px",
		fontFamily: "Arial, sans-serif",
	},
	container: {
		backgroundColor: "#ffffff",
		padding: "24px",
		borderRadius: "12px",
		textAlign: "center",
		boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.05)",
	},
	header: { marginBottom: "20px" },
	logo: { display: "block", margin: "0 auto" },
	image: { width: "100%", height: "auto", borderRadius: "8px" },
	heading: {
		color: "#4A154B",
		fontSize: "24px",
		fontWeight: "bold",
		margin: "20px 0 10px",
	},
	text: {
		color: "#333",
		fontSize: "16px",
		lineHeight: "1.6",
		marginBottom: "20px",
	},
	button: {
		backgroundColor: "#4A154B",
		color: "#FFFFFF",
		padding: "12px 24px",
		borderRadius: "8px",
		textDecoration: "none",
		display: "inline-block",
		fontWeight: "bold",
		cursor: "pointer",
	},
	footer: { marginTop: "30px", fontSize: "14px", color: "#777" },
	unsubscribe: { fontSize: "12px", color: "#999", marginTop: "10px" },
	link: { color: "#4A154B", textDecoration: "none", fontWeight: "bold" },
};

module.exports = (props) => render(React.createElement(NewsletterEmail, props));
