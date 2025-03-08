// utils/emails/WelcomeEmail.js

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

const WelcomeEmail = ({ name, unsubscribeLink }) => {
	return (
		<Html>
			<Head />
			<Preview>Welcome to our newsletter!</Preview>
			<Body style={styles.body}>
				<Container style={styles.container}>
					<Heading style={styles.heading}>Welcome, {name}!</Heading>
					<Text style={styles.text}>
						Thank you for subscribing to our newsletter. We’re excited to have
						you on board!
					</Text>
					<Button style={styles.button} href={unsubscribeLink}>
						Unsubscribe
					</Button>
				</Container>
			</Body>
		</Html>
	);
};

// Styles for email components
const styles = {
	body: { backgroundColor: "#f4f4f4", padding: "20px" },
	container: {
		backgroundColor: "#ffffff",
		padding: "20px",
		borderRadius: "10px",
		textAlign: "center",
	},
	heading: { color: "#333", fontSize: "24px" },
	text: { color: "#555", fontSize: "16px" },
	button: {
		backgroundColor: "#007bff",
		color: "#ffffff",
		padding: "10px 20px",
		borderRadius: "5px",
		textDecoration: "none",
		display: "inline-block",
		marginTop: "20px",
	},
};

module.exports = (props) => render(<WelcomeEmail {...props} />);
