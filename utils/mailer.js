const nodemailer = require("nodemailer");
const welcomeEmailTemplate = require("./emails/WelcomeEmail");

let testAccount;
(async () => {
	testAccount = await nodemailer.createTestAccount();
})();

// Send email function
const sendEmail = async (to, subject, html) => {
	try {
		// Create a transporter for Ethereal
		let transporter = nodemailer.createTransport({
			host: "smtp.ethereal.email",
			port: 587,
			secure: false,
			auth: {
				user: testAccount.user,
				pass: testAccount.pass,
			},
		});

		// Send mail
		let info = await transporter.sendMail({
			from: '"AbleGod" <no-reply@ablegod.com>',
			to,
			subject,
			html,
		});

		console.log("✅ Message sent: %s", info.messageId);
		console.log("🔗 Preview URL: %s", nodemailer.getTestMessageUrl(info));
	} catch (error) {
		console.error("❌ Error sending email:", error.message);
	}
};

// Send Welcome Email function
const sendWelcomeEmail = async (email, name, id, req) => {
	try {
		const unsubscribeLink = `${req.protocol}://${req.get("host")}/api/subscribers/${id}?status=inactive`;
		const emailHtml = welcomeEmailTemplate({ name, unsubscribeLink });

		await sendEmail(email, "Welcome to Our Newsletter!", emailHtml);
	} catch (error) {
		console.error("❌ Error in sendWelcomeEmail:", error.message);
	}
};

module.exports = { sendEmail, sendWelcomeEmail };
