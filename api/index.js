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
	"http://192.168.1.197:8080/",
	"https://www.chistanwrites.blog",
];

// Middleware
app.use(
	cors({
		origin: allowedOrigins,
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
const subscriberRoutes = require("./routes/subscriber");

app.use("/api/posts", blogRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api", authRoutes);
app.use("/api/subscribers", subscriberRoutes);

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
		credentials,
		scopes: SCOPES,
	});
	return auth.getClient();
};

// Function to calculate date ranges
function getDateRange(range) {
	const endDate = new Date();
	let startDate;

	switch (range) {
		case "7d":
			startDate = new Date();
			startDate.setDate(endDate.getDate() - 7);
			break;
		case "14d":
			startDate = new Date();
			startDate.setDate(endDate.getDate() - 14);
			break;
		case "1m":
			startDate = new Date();
			startDate.setMonth(endDate.getMonth() - 1);
			break;
		case "3m":
			startDate = new Date();
			startDate.setMonth(endDate.getMonth() - 3);
			break;
		case "6m":
			startDate = new Date();
			startDate.setMonth(endDate.getMonth() - 6);
			break;
		case "all":
			startDate = new Date(2020, 0, 1); //set to the oldest date possible in GA4
			break;
		default:
			startDate = new Date(); // Default to last 7 days if no valid range
			startDate.setDate(endDate.getDate() - 7);
	}

	const formattedStartDate = startDate.toISOString().split("T")[0];
	const formattedEndDate = endDate.toISOString().split("T")[0];

	return { startDate: formattedStartDate, endDate: formattedEndDate };
}

// Fetch GA4 Metrics Route
app.get("/api/analytics", async (req, res) => {
	try {
		const range = req.query.range || "7d"; // Get range from query parameter
		const { startDate, endDate } = getDateRange(range);

		const analyticsData = google.analyticsdata("v1beta");
		const authClient = await authenticate();

		const response = await analyticsData.properties.runReport({
			auth: authClient,
			property: `properties/${propertyId}`,
			requestBody: {
				dateRanges: [{ startDate: startDate, endDate: endDate }],
				metrics: [
					{ name: "totalUsers" },
					{ name: "newUsers" },
					{ name: "sessions" },
					{ name: "bounceRate" },
					{ name: "engagementRate" },
					{ name: "screenPageViews" }, // For top pages
				],
				dimensions: [
					{ name: "date" },
					{ name: "pageTitle" },
					{ name: "sessionSource" },
					{ name: "sessionMedium" },
					{ name: "country" },
					{ name: "deviceCategory" },
					{ name: "operatingSystem" },
				],
			},
		});

		// Transform API response to match expected mock data format
		const formattedData = response.data.rows.map((row) => ({
			date: row.dimensionValues[0]?.value || "",
			pageTitle: row.dimensionValues[1]?.value || "",
			referrer: {
				source: row.dimensionValues[2]?.value || "",
				medium: row.dimensionValues[3]?.value || "",
			},
			location: {
				country: row.dimensionValues[4]?.value || "",
			},
			device: {
				category: row.dimensionValues[5]?.value || "",
			},
			os: {
				name: row.dimensionValues[6]?.value || "",
			},
			metrics: {
				totalUsers: Number(row.metricValues[0]?.value) || 0,
				newUsers: Number(row.metricValues[1]?.value) || 0,
				sessions: Number(row.metricValues[2]?.value) || 0,
				bounceRate: parseFloat(row.metricValues[3]?.value) || 0,
				engagementRate: parseFloat(row.metricValues[4]?.value) || 0,
				pageViews: Number(row.metricValues[5]?.value) || 0,
			},
		}));

		res.json(formattedData);
	} catch (error) {
		console.error("Error fetching GA4 metrics:", error.message);
		res
			.status(500)
			.json({ error: error.message || "Failed to fetch GA4 metrics" });
	}
});

app.get("/api/currently-online", async (req, res) => {
	try {
		const analyticsData = google.analyticsdata("v1beta");
		const authClient = await authenticate();

		const response = await analyticsData.properties.runRealtimeReport({
			// Use runRealTimeReport
			auth: authClient,
			property: `properties/${propertyId}`,
			requestBody: {
				metrics: [{ name: "activeUsers" }],
			},
		});

		const currentlyOnline =
			parseInt(response.data.rows[0].metricValues[0].value, 10) || 0;

		res.json({ currentlyOnline });
	} catch (error) {
		console.error("Error fetching currently online users:", error);
		res.status(500).json({ error: "Failed to fetch real-time users" }); // Appropriate error response
	}
});

// Start the Server
server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
