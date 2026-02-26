// api/index.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

// Socket.io imports
const http = require("http");
const { Server } = require("socket.io");
const { exec } = require("child_process");
const {
	requireAdminOrAuthor,
	resolveAuthContextFromToken,
} = require("./middleware/auth");

const { google } = require("googleapis");

const projectRoot = path.resolve(__dirname, "..");
const envLocalPath = path.join(projectRoot, ".env.local");
if (fs.existsSync(envLocalPath)) {
	dotenv.config({ path: envLocalPath });
}
dotenv.config({ path: path.join(projectRoot, ".env") });

const app = express();
const port = process.env.PORT || 3001;

// Define our allowed origins
const allowedOrigins = [
	"http://localhost:8080",
	"http://localhost:3000",
	"http://192.168.1.197:8080",
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

io.use(async (socket, next) => {
	try {
		const authHeader = socket.handshake.headers?.authorization || "";
		const headerToken =
			typeof authHeader === "string" && authHeader.startsWith("Bearer ")
				? authHeader.slice(7)
				: null;
		const socketToken =
			typeof socket.handshake.auth?.token === "string"
				? socket.handshake.auth.token
				: null;
		const token = socketToken || headerToken;

		if (!token) {
			socket.data.authContext = null;
			return next();
		}

		socket.data.authContext = await resolveAuthContextFromToken(token);
		return next();
	} catch (error) {
		console.warn("[socket] auth handshake failed:", error?.message || error);
		socket.data.authContext = null;
		return next();
	}
});

// Routes
const blogRoutes = require("./routes/blog");
const userRoutes = require("./routes/user");
const categoryRoutes = require("./routes/category");
const authRoutes = require("./routes/auth");
const subscriberRoutes = require("./routes/subscriber");
const createNotificationRoutes = require("./routes/notification");
const createChatRoutes = require("./routes/chat");
const createStreamRoutes = require("./routes/stream");
const ChatConversation = require("./models/chatConversation");

app.use("/api/posts", blogRoutes);
app.use("/api/users", userRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", authRoutes); // Backward compatibility alias for /api/login
app.use("/api/subscribers", subscriberRoutes);
app.use("/api/notifications", createNotificationRoutes(io));
app.use("/api/chat", createChatRoutes(io));
app.use("/api/stream", createStreamRoutes(io));

// File Upload Route (Requires multer)
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		// Ensure 'public/uploads' exists or consider using /tmp for serverless
		cb(null, 'public/uploads/');
	},
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname);
		cb(null, `${uuidv4()}${ext}`);
	}
});
const upload = multer({ storage });

app.post('/api/upload', ...requireAdminOrAuthor, upload.single('image'), (req, res) => {
	if (!req.file) {
		return res.status(400).json({ error: 'No file uploaded' });
	}
	// Return the URL that points to the static file served by express
	const protocol = req.protocol;
	const host = req.get('host');
	const url = `${protocol}://${host}/uploads/${req.file.filename}`;
	res.json({ url });
});

// Serve static files (including sitemap.xml)
app.use(express.static(path.join(__dirname, "../public")));

// Socket.IO Notification Logic
io.on("connection", (socket) => {
	console.log(`User connected: ${socket.id}`);

	const getSocketUser = () => socket.data?.authContext?.user || null;
	const isPrivilegedSocketUser = () =>
		["admin", "author"].includes(
			String(getSocketUser()?.role || "").toLowerCase()
		);
	const resolveSocketArgValue = (payload, key) =>
		typeof payload === "string"
			? payload
			: payload && typeof payload === "object"
			? payload[key]
			: null;
	const ackError = (ack, message) => {
		if (typeof ack === "function") ack({ success: false, message });
	};
	const ackSuccess = (ack, room) => {
		if (typeof ack === "function") ack({ success: true, room });
	};

	// Event listener for sending notifications
	socket.on("sendNotification", (data) => {
		console.log(`Notification received: ${data.message}`);
		// Broadcast the notification to all connected clients
		io.emit("receiveNotification", data);
	});

	socket.on("joinUserRoom", (payload, ack) => {
		const userId = resolveSocketArgValue(payload, "userId");
		if (!userId) return ackError(ack, "userId is required");

		const authUser = getSocketUser();
		const isAllowed =
			authUser &&
			(String(authUser.id) === String(userId) || isPrivilegedSocketUser());

		if (!isAllowed) {
			return ackError(ack, "Insufficient permissions");
		}

		socket.join(`user:${userId}`);
		return ackSuccess(ack, `user:${userId}`);
	});

	socket.on("leaveUserRoom", (payload, ack) => {
		const userId = resolveSocketArgValue(payload, "userId");
		if (!userId) return ackError(ack, "userId is required");
		socket.leave(`user:${userId}`);
		return ackSuccess(ack, `user:${userId}`);
	});

	socket.on("joinConversationRoom", async (payload, ack) => {
		try {
			const conversationId = resolveSocketArgValue(payload, "conversationId");
			if (!conversationId) return ackError(ack, "conversationId is required");

			const authUser = getSocketUser();
			if (!authUser) return ackError(ack, "Authentication required");

			const conversation = await ChatConversation.findOne({
				id: String(conversationId),
			});
			if (!conversation) return ackError(ack, "Conversation not found");

			const isMember = (conversation.member_ids || []).some(
				(memberId) => String(memberId) === String(authUser.id)
			);

			if (!isMember && !isPrivilegedSocketUser()) {
				return ackError(ack, "Insufficient permissions");
			}

			socket.join(`conversation:${conversationId}`);
			return ackSuccess(ack, `conversation:${conversationId}`);
		} catch (error) {
			console.error("[socket] joinConversationRoom failed:", error);
			return ackError(ack, "Failed to join conversation room");
		}
	});

	socket.on("leaveConversationRoom", (payload, ack) => {
		const conversationId = resolveSocketArgValue(payload, "conversationId");
		if (!conversationId) return ackError(ack, "conversationId is required");
		socket.leave(`conversation:${conversationId}`);
		return ackSuccess(ack, `conversation:${conversationId}`);
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

// Notification routes are mounted above via ./routes/notification (REST + realtime fanout).

// Google Analytics Data API Setup (lazy/guarded so missing envs don't crash the server)
const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];
const propertyId = process.env.GA4_PROPERTY_ID;
let gaCredentials = null;

// Authenticate Service Account
const authenticate = async () => {
	if (!propertyId) {
		const error = new Error("GA4 analytics is not configured (missing GA4_PROPERTY_ID)");
		error.statusCode = 503;
		throw error;
	}

	if (!gaCredentials) {
		const encodedServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;
		if (!encodedServiceAccount) {
			const error = new Error(
				"GA4 analytics is not configured (missing GOOGLE_SERVICE_ACCOUNT_BASE64)"
			);
			error.statusCode = 503;
			throw error;
		}

		try {
			const serviceAccountJson = Buffer.from(
				encodedServiceAccount,
				"base64"
			).toString("utf8");
			gaCredentials = JSON.parse(serviceAccountJson);
		} catch (parseError) {
			console.error("Invalid GOOGLE_SERVICE_ACCOUNT_BASE64 payload:", parseError);
			const error = new Error("GA4 analytics credentials are invalid");
			error.statusCode = 500;
			throw error;
		}
	}

	const auth = new google.auth.GoogleAuth({
		credentials: gaCredentials,
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
app.get("/api/analytics", ...requireAdminOrAuthor, async (req, res) => {
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
			.status(error.statusCode || 500)
			.json({ error: error.message || "Failed to fetch GA4 metrics" });
	}
});

app.get("/api/currently-online", ...requireAdminOrAuthor, async (req, res) => {
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
		res
			.status(error.statusCode || 500)
			.json({ error: error.message || "Failed to fetch real-time users" }); // Appropriate error response
	}
});

// Start the Server only when executed directly (not when imported for tests)
if (require.main === module) {
	server.listen(port, () => {
		console.log(`Server is running on port ${port}`);
	});
}

module.exports = {
	app,
	server,
	io,
	mongoose,
};
