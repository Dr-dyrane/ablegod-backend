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
		credentials,
		scopes: SCOPES,
	});
	return auth.getClient();
};

// Fetch GA4 Metrics Route
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
