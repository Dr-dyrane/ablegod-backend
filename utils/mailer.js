const nodemailer = require("nodemailer");
const welcomeEmailTemplate = require("./emails/WelcomeEmail");

const sendEmail = async (to, subject, html) => {
	try {
		// Generate test SMTP service account from ethereal.email
		// Only needed once per session
		let testAccount = await nodemailer.createTestAccount(); // Async operation

		// Create a transporter for Ethereal
		let transporter = nodemailer.createTransport({
			host: "smtp.ethereal.email",
			port: 587,
			secure: false, // true for 465, false for other ports
			auth: {
				user: testAccount.user, // generated ethereal user
				pass: testAccount.pass, // generated ethereal password
			},
		});

		// send mail with defined transport object
		let info = await transporter.sendMail({
			from: '"ableGod" <foo@example.com>', // You can use a fake sender address
			to,
			subject,
			html,
		});

		console.log("Message sent: %s", info.messageId);
		// Preview only available when sending through an Ethereal account
		console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
	} catch (error) {
		console.error("Error sending email:", error); // Log the error
	}
};

const sendWelcomeEmail = async (email, name, req) => {
	// Removed the id parameter
	try {
		const unsubscribeLink = `${req.protocol}://${req.get("host")}/api/subscribers/${req.params.id}?status=inactive`;
		const emailHtml = welcomeEmailTemplate({ name, unsubscribeLink });
		await sendEmail(email, "Welcome to Our Newsletter!", emailHtml);
	} catch (error) {
		console.error("Error in sendWelcomeEmail:", error.message, error.stack);
	}
};

module.exports = { sendEmail, sendWelcomeEmail };
