const {
	Html,
	Head,
	Preview,
	Body,
	Container,
	Heading,
	Text,
	Button,
} = require("@react-email/components");
const { render } = require("@react-email/render");
const React = require("react");

const WelcomeEmail = ({ name, unsubscribeLink }) => {
	return React.createElement(
		Html,
		null,
		React.createElement(Head, null),
		React.createElement(Preview, null, "Welcome to our newsletter!"),
		React.createElement(
			Body,
			{ style: styles.body },
			React.createElement(
				Container,
				{ style: styles.container },
				React.createElement(
					Heading,
					{ style: styles.heading },
					`Welcome, ${name}!`
				),
				React.createElement(
					Text,
					{ style: styles.text },
					"Thank you for subscribing to our newsletter. We’re excited to have you on board!"
				),
				React.createElement(
					Button,
					{ style: styles.button, href: unsubscribeLink },
					"Unsubscribe"
				)
			)
		)
	);
};

// Updated styles to match Tailwind setup
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
	heading: { color: "#4A154B", fontSize: "24px", fontWeight: "bold" },
	text: { color: "#333", fontSize: "16px", lineHeight: "1.6" },
	button: {
		backgroundColor: "#4A154B",
		color: "#FFFFFF",
		padding: "12px 24px",
		borderRadius: "8px",
		textDecoration: "none",
		display: "inline-block",
		fontWeight: "bold",
		marginTop: "20px",
		cursor: "pointer",
	},
};

module.exports = (props) => render(React.createElement(WelcomeEmail, props));
