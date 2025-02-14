// api/index.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

// Socket.io imports
const http = require("http");
const { Server } = require("socket.io");
const { exec } = require("child_process");

const { google } = require("googleapis");

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Define our allowed origins
const allowedOrigins = [
	"http://localhost:8080",
	"https://www.chistanwrites.blog",
];

// Middleware
app.use(
	cors({
		origin: allowedOrigins,
		methods: ["GET", "POST"],
	})
);
app.use(express.json()); // To handle JSON requests

// MongoDB Connection
mongoose
	.connect(process.env.MONGODB_URI, {})
	.then(() => console.log("MongoDB connected"))
	.catch((err) => console.error("MongoDB connection error:", err));

// Socket.io connection
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: allowedOrigins,
		methods: ["GET", "POST"],
	},
	transports: ["websocket", "polling"], // Ensures compatibility
});

// Routes
const blogRoutes = require("./routes/blog");
const userRoutes = require("./routes/user");
const categoryRoutes = require("./routes/category");
const authRoutes = require("./routes/auth");

app.use("/api/posts", blogRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api", authRoutes);

// Serve static files (including sitemap.xml)
const path = require("path");
app.use(express.static(path.join(__dirname, "../public")));

// Socket.IO Notification Logic
io.on("connection", (socket) => {
	console.log(`User connected: ${socket.id}`);

	// Event listener for sending notifications
	socket.on("sendNotification", (data) => {
		console.log(`Notification received: ${data.message}`);
		// Broadcast the notification to all connected clients
		io.emit("receiveNotification", data);
	});

	socket.on("disconnect", () => {
		console.log(`User disconnected: ${socket.id}`);
	});
});

// Health check endpoint for Socket.io
app.get("/socket.io/test", (req, res) => {
	res
		.status(200)
		.json({ success: true, message: "WebSocket server is running!" });
});

// Notification Route for Testing
app.post("/api/notifications", (req, res) => {
	const { message, userId } = req.body;

	// Send the notification to all users or a specific user
	if (userId) {
		io.to(userId).emit("receiveNotification", { message });
	} else {
		io.emit("receiveNotification", { message });
	}
	res.status(200).json({ success: true, message: "Notification sent" });
});

// Google Analytics Data API Setup
const serviceAccountJson = Buffer.from(
	process.env.GOOGLE_SERVICE_ACCOUNT_BASE64,
	"base64"
).toString("utf8");
const credentials = JSON.parse(serviceAccountJson);
const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];
const propertyId = process.env.GA4_PROPERTY_ID;

// Authenticate Service Account
const authenticate = async () => {
	const auth = new google.auth.GoogleAuth({
		// credentials: {
		// 	type: process.env.SA_TYPE,
		// 	project_id: process.env.SA_PROJECT_ID,
		// 	private_key_id: process.env.SA_PRIVATE_KEY_ID,
		// 	private_key: process.env.SA_PRIVATE_KEY.replace(/\\n/g, "\n").trim(),
		// 	client_email: process.env.SA_CLIENT_EMAIL,
		// 	client_id: process.env.SA_CLIENT_ID,
		// 	auth_uri: process.env.SA_AUTH_URI,
		// 	token_uri: process.env.SA_TOKEN_URI,
		// 	auth_provider_x509_cert_url: process.env.SA_AUTH_PROVIDER_CERT_URL,
		// 	client_x509_cert_url: process.env.SA_CLIENT_CERT_URL,
		// },
		// keyFile: path.join(__dirname, 'service-account-file.json'),
		credentials,
		scopes: SCOPES,
	});
	return auth.getClient();
};

const startDate = "7daysAgo"; // Or any desired start date
const endDate = "today";

async function runReport(auth, requestBody) {
	const analyticsData = google.analyticsdata("v1beta");
	const response = await analyticsData.properties.runReport({
		auth,
		property: `properties/${propertyId}`,
		requestBody,
	});
	return response.data;
}

app.get("/api/allAnalyticsData", async (req, res) => {
	try {
		const authClient = await authenticate();

		const [
			activeUsersResponse,
			topPagesResponse,
			referrersResponse,
			countriesResponse,
			devicesResponse,
			osResponse,
			pageViewsResponse,
			bounceRateResponse,
			newUsersResponse,
		] = await Promise.all([
			runReport(authClient, {
				// active users
				dateRanges: [{ startDate, endDate }],
				metrics: [{ name: "activeUsers" }],
				dimensions: [{ name: "date" }],
			}),
			runReport(authClient, {
				// top pages - adjust metric/dimension if needed
				dateRanges: [{ startDate, endDate }],
				metrics: [{ name: "screenPageViews" }],
				dimensions: [{ name: "fullPageUrl" }],
				orderBy: [{ metric: { metricName: "screenPageViews" }, desc: true }],
			}),
			// Referrers (adjust metric/dimension)
			runReport(authClient, {
				dateRanges: [{ startDate, endDate }],
				metrics: [{ name: "sessions" }], // Example metric - adjust as needed
				dimensions: [{ name: "sessionSource" }], // Or another dimension
			}),
			// Countries, Devices, OS - needs specific dimensions from GA4
			// Example: Countries (replace with your actual dimensions/metrics)
			runReport(authClient, {
				dateRanges: [{ startDate, endDate }],
				metrics: [{ name: "sessions" }],
				dimensions: [{ name: "country" }], // Correct dimension name for country
			}),
			runReport(authClient, {
				//deviceCategory
				dateRanges: [{ startDate, endDate }],
				metrics: [{ name: "sessions" }],
				dimensions: [{ name: "deviceCategory" }],
			}),
			runReport(authClient, {
				//operating system
				dateRanges: [{ startDate, endDate }],
				metrics: [{ name: "sessions" }],
				dimensions: [{ name: "operatingSystem" }],
			}),

			// Page Views
			runReport(authClient, {
				dateRanges: [{ startDate, endDate }],
				metrics: [{ name: "totalUsers" }],
				dimensions: [{ name: "date" }],
			}),
			// Bounce Rate
			runReport(authClient, {
				dateRanges: [{ startDate, endDate }],
				metrics: [{ name: "bounceRate" }],
				dimensions: [{ name: "date" }],
			}),
			// New Users
			runReport(authClient, {
				dateRanges: [{ startDate, endDate }],
				metrics: [{ name: "newUsers" }],
				dimensions: [{ name: "date" }],
			}),
		]);

		const allData = {
			metrics: activeUsersResponse.rows.map(formatRow),
			topPages: topPagesResponse.rows.map(formatRow),
			referrers: referrersResponse.rows.map(formatRow),
			countries: countriesResponse.rows.map(formatRow), // Format as needed
			devices: devicesResponse.rows.map(formatRow), // Format as needed
			operatingSystems: osResponse.rows.map(formatRow), // Format as needed
			pageViews: pageViewsResponse.rows.map(formatRow), // Format as needed
			bounceRate: bounceRateResponse.rows.map(formatRow), // Format as needed
			newUsers: newUsersResponse.rows.map(formatRow), // Format as needed
		};

		res.json(allData);
	} catch (error) {
		console.error("Error fetching data:", error);
		res.status(500).json({ error: "Failed to fetch data" });
	}
});

function formatRow(row) {
	return {
		date: row.dimensionValues?.[0]?.value,
		name: row.dimensionValues?.[0]?.value,
		path: row.dimensionValues?.[0]?.value, // Adjust based on your dimensions
		visits: parseInt(row.metricValues?.[0]?.value, 10) || 0,
		sessions: parseInt(row.metricValues?.[0]?.value, 10) || 0, //add sessions
		activeUsers: parseInt(row.metricValues?.[0]?.value, 10) || 0, // Add activeUsers
		pageViews: parseInt(row.metricValues?.[0]?.value, 10) || 0, // Add pageViews
		bounceRate: parseFloat(row.metricValues?.[0]?.value) || 0, // Add bounceRate
		newUsers: parseInt(row.metricValues?.[0]?.value, 10) || 0, // Add newUsers
		percentage: row.metricValues?.[0]?.value + "%" || "0%",
	};
}


app.get("/api/analytics", async (req, res) => {
	try {
		const analyticsData = google.analyticsdata("v1beta");
		const authClient = await authenticate();

		const response = await analyticsData.properties.runReport({
			auth: authClient,
			property: `properties/${propertyId}`,
			requestBody: {
				dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
				metrics: [{ name: "activeUsers" }],
				dimensions: [{ name: "date" }],
			},
		});

		res.json(response.data);
	} catch (error) {
		console.error("Error fetching GA4 metrics:", error.message);
		res
			.status(500)
			.json({ error: error.message || "Failed to fetch GA4 metrics" });
	}
});

// Start the Server
server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
