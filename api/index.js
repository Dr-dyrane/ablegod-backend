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

const {
	requireAdminOrAuthor,
	resolveAuthContextFromToken,
} = require("./middleware/auth");

const { google } = require("googleapis");

// -----------------------------
// Env loading
// -----------------------------
const projectRoot = path.resolve(__dirname, "..");
const envLocalPath = path.join(projectRoot, ".env.local");
if (fs.existsSync(envLocalPath)) {
	dotenv.config({ path: envLocalPath });
}
dotenv.config({ path: path.join(projectRoot, ".env") });

// -----------------------------
// App setup
// -----------------------------
const app = express();
const port = process.env.PORT || 3001;

// -----------------------------
// CORS (fixed + more robust)
// -----------------------------
const allowedOrigins = new Set([
	"http://localhost:8080",
	"http://localhost:3000",
	"http://192.168.1.197:8080",
	"https://www.chistanwrites.blog",
	"https://chistanwrites.blog",
]);

const corsOptions = {
	origin(origin, cb) {
		// Allow same-origin / server-to-server / curl/postman (no Origin header)
		if (!origin) return cb(null, true);

		try {
			const { hostname } = new URL(origin);

			if (allowedOrigins.has(origin)) return cb(null, true);

			// Optional: allow Vercel preview domains
			if (hostname.endsWith(".vercel.app")) return cb(null, true);

			console.log("[CORS] Blocked origin:", origin);
			return cb(new Error("Not allowed by CORS"));
		} catch (e) {
			console.log("[CORS] Invalid origin:", origin);
			return cb(new Error("Not allowed by CORS"));
		}
	},
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization"],
	credentials: true,
};

// IMPORTANT: must be early
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// -----------------------------
// MongoDB connection (guarded)
// -----------------------------
if (!process.env.MONGODB_URI) {
	console.warn("[MongoDB] Missing MONGODB_URI — server will likely fail DB routes.");
} else {
	mongoose
		.connect(process.env.MONGODB_URI, {})
		.then(() => console.log("MongoDB connected"))
		.catch((err) => console.error("MongoDB connection error:", err));
}

// -----------------------------
// Socket.io
// -----------------------------
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: (origin, cb) => corsOptions.origin(origin, cb),
		methods: ["GET", "POST"],
		credentials: true,
	},
	transports: ["websocket", "polling"],
});

// Attach auth context to sockets (non-fatal)
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

// -----------------------------
// Routes
// -----------------------------
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

// -----------------------------
// Uploads (multer)
// -----------------------------
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const uploadsDir = path.join(projectRoot, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
	// This helps locally; on serverless this may not persist.
	fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, uploadsDir),
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname);
		cb(null, `${uuidv4()}${ext}`);
	},
});

const upload = multer({ storage });

app.post(
	"/api/upload",
	requireAdminOrAuthor, // ✅ FIXED: no spread
	upload.single("image"),
	(req, res) => {
		if (!req.file) return res.status(400).json({ error: "No file uploaded" });

		const protocol = req.protocol;
		const host = req.get("host");
		const url = `${protocol}://${host}/uploads/${req.file.filename}`;
		res.json({ url });
	}
);

// Serve static files
app.use(express.static(path.join(projectRoot, "public")));

// -----------------------------
// Socket event handlers
// -----------------------------
io.on("connection", (socket) => {
	console.log(`User connected: ${socket.id}`);

	const getSocketUser = () => socket.data?.authContext?.user || null;

	const isPrivilegedSocketUser = () =>
		["admin", "author"].includes(String(getSocketUser()?.role || "").toLowerCase());

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

	socket.on("sendNotification", (data) => {
		console.log(`Notification received: ${data?.message}`);
		io.emit("receiveNotification", data);
	});

	socket.on("joinUserRoom", (payload, ack) => {
		const userId = resolveSocketArgValue(payload, "userId");
		if (!userId) return ackError(ack, "userId is required");

		const authUser = getSocketUser();
		const isAllowed =
			authUser &&
			(String(authUser.id) === String(userId) || isPrivilegedSocketUser());

		if (!isAllowed) return ackError(ack, "Insufficient permissions");

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

			if (!isMember && !isPrivilegedSocketUser())
				return ackError(ack, "Insufficient permissions");

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

// Health check
app.get("/socket.io/test", (req, res) => {
	res.status(200).json({ success: true, message: "WebSocket server is running!" });
});

// -----------------------------
// GA4 Analytics (guarded)
// -----------------------------
const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];
const propertyId = process.env.GA4_PROPERTY_ID;
let gaCredentials = null;

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
			const serviceAccountJson = Buffer.from(encodedServiceAccount, "base64").toString("utf8");
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
			startDate = new Date(2020, 0, 1);
			break;
		default:
			startDate = new Date();
			startDate.setDate(endDate.getDate() - 7);
	}

	return {
		startDate: startDate.toISOString().split("T")[0],
		endDate: endDate.toISOString().split("T")[0],
	};
}

app.get("/api/analytics", requireAdminOrAuthor, async (req, res) => {
	try {
		const range = req.query.range || "7d";
		const { startDate, endDate } = getDateRange(range);

		const analyticsData = google.analyticsdata("v1beta");
		const authClient = await authenticate();

		const response = await analyticsData.properties.runReport({
			auth: authClient,
			property: `properties/${propertyId}`,
			requestBody: {
				dateRanges: [{ startDate, endDate }],
				metrics: [
					{ name: "totalUsers" },
					{ name: "newUsers" },
					{ name: "sessions" },
					{ name: "bounceRate" },
					{ name: "engagementRate" },
					{ name: "screenPageViews" },
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

		const formattedData = (response.data.rows || []).map((row) => ({
			date: row.dimensionValues?.[0]?.value || "",
			pageTitle: row.dimensionValues?.[1]?.value || "",
			referrer: {
				source: row.dimensionValues?.[2]?.value || "",
				medium: row.dimensionValues?.[3]?.value || "",
			},
			location: {
				country: row.dimensionValues?.[4]?.value || "",
			},
			device: {
				category: row.dimensionValues?.[5]?.value || "",
			},
			os: {
				name: row.dimensionValues?.[6]?.value || "",
			},
			metrics: {
				totalUsers: Number(row.metricValues?.[0]?.value) || 0,
				newUsers: Number(row.metricValues?.[1]?.value) || 0,
				sessions: Number(row.metricValues?.[2]?.value) || 0,
				bounceRate: parseFloat(row.metricValues?.[3]?.value) || 0,
				engagementRate: parseFloat(row.metricValues?.[4]?.value) || 0,
				pageViews: Number(row.metricValues?.[5]?.value) || 0,
			},
		}));

		res.json(formattedData);
	} catch (error) {
		console.error("Error fetching GA4 metrics:", error.message || error);
		res
			.status(error.statusCode || 500)
			.json({ error: error.message || "Failed to fetch GA4 metrics" });
	}
});

app.get("/api/currently-online", requireAdminOrAuthor, async (req, res) => {
	try {
		const analyticsData = google.analyticsdata("v1beta");
		const authClient = await authenticate();

		const response = await analyticsData.properties.runRealtimeReport({
			auth: authClient,
			property: `properties/${propertyId}`,
			requestBody: {
				metrics: [{ name: "activeUsers" }],
			},
		});

		const currentlyOnline =
			parseInt(response.data?.rows?.[0]?.metricValues?.[0]?.value, 10) || 0;

		res.json({ currentlyOnline });
	} catch (error) {
		console.error("Error fetching currently online users:", error.message || error);
		res
			.status(error.statusCode || 500)
			.json({ error: error.message || "Failed to fetch real-time users" });
	}
});

// -----------------------------
// Start server (only if run directly)
// -----------------------------
if (require.main === module) {
	server.listen(port, () => {
		console.log(`Server is running on port ${port}`);
	});
}

module.exports = { app, server, io, mongoose };