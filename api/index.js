// api/index.js

const express = require("express");

const mongoose = require("mongoose");

const dotenv = require("dotenv");

const fs = require("fs");

const path = require("path");

const cors = require("cors");



// Real-time imports

const Pusher = require("pusher");

const http = require("http");

const { Server } = require("socket.io");



const {

	requireAdminOrAuthor,
	requireCapabilities,

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

const port = process.env.PORT || 3000;



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



// Debug route - no database dependency

app.get("/api/debug", (req, res) => {

	res.json({

		message: "Debug route working - MongoDB Check",

		origin: req.headers.origin,

		timestamp: new Date().toISOString(),

		mongodb: {

			readyState: mongoose.connection.readyState,

			host: mongoose.connection.host || 'Not connected',

			name: mongoose.connection.name || 'Not connected'

		},

		env: {

			hasMongodbUri: !!process.env.MONGODB_URI,

			mongodbUriLength: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,

			nodeEnv: process.env.NODE_ENV || 'development'

		}

	});

});



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

// Real-time setup (Hybrid: Socket.io + Pusher)

// -----------------------------

const server = http.createServer(app);

const io = new Server(server, {

	cors: corsOptions,

	transports: ["websocket", "polling"],

});



const hasPusherConfig = Boolean(
	process.env.PUSHER_APP_ID &&
	process.env.PUSHER_KEY &&
	process.env.PUSHER_SECRET &&
	process.env.PUSHER_CLUSTER
);

const shouldUsePusher =
	process.env.NODE_ENV !== "test" &&
	process.env.DISABLE_PUSHER !== "true" &&
	hasPusherConfig;

if (!shouldUsePusher && process.env.NODE_ENV !== "test") {
	const reason =
		process.env.DISABLE_PUSHER === "true"
			? "DISABLE_PUSHER=true"
			: "missing PUSHER_* environment variables";
	console.log(`[realtime] Pusher disabled (${reason}).`);
}

const pusher = shouldUsePusher
	? new Pusher({
		appId: process.env.PUSHER_APP_ID,
		key: process.env.PUSHER_KEY,
		secret: process.env.PUSHER_SECRET,
		cluster: process.env.PUSHER_CLUSTER,
		useTLS: true,
	})
	: null;

const pusherRequestTimeoutMs = Number(process.env.PUSHER_TIMEOUT_MS || 1500);

async function triggerPusherWithTimeout(channel, event, payload) {
	if (!pusher) return;

	let timeoutHandle = null;
	try {
		await Promise.race([
			pusher.trigger(channel, event, payload),
			new Promise((_, reject) => {
				timeoutHandle = setTimeout(
					() => reject(new Error(`Pusher timeout after ${pusherRequestTimeoutMs}ms`)),
					pusherRequestTimeoutMs
				);
			}),
		]);
	} finally {
		if (timeoutHandle) clearTimeout(timeoutHandle);
	}
}



// Unified broadcasting helper

const realtimeDispatcher = {

	trigger: async (channel, event, payload) => {

		// 1. Send via Socket.io

		try {

			if (io) {

				// Handle both 'user-123' and 'user:123' style channel names

				const socketRoom = channel.replace(":", "-");

				io.to(socketRoom).emit(event, payload);

				// Also emit to the original name just in case

				if (socketRoom !== channel) io.to(channel).emit(event, payload);



				// Global broadcast for specific events

				if (channel === "notifications") io.emit(event, payload);

			}

		} catch (err) {

			console.warn("[realtime] Socket.io emit failed:", err.message);

		}



		// 2. Send via Pusher (for production/fallback)

		try {

			if (pusher) {

				const pusherChannel = channel.replace(":", "-");

				await triggerPusherWithTimeout(pusherChannel, event, payload);

			}

		} catch (err) {

			console.warn("[realtime] Pusher trigger failed:", err.message);

		}

	}

};



// Simple connection logger for Socket.io

io.on("connection", (socket) => {

	console.log(`Socket connected: ${socket.id}`);



	socket.on("joinUserRoom", (data) => {

		const userId = typeof data === "string" ? data : data?.userId;

		if (userId) {

			socket.join(`user-${userId}`);

			console.log(`Socket ${socket.id} joined user-${userId}`);

		}

	});



	socket.on("joinConversationRoom", (data) => {

		const conversationId = typeof data === "string" ? data : data?.conversationId;

		if (conversationId) {

			socket.join(`conversation-${conversationId}`);

			console.log(`Socket ${socket.id} joined conversation-${conversationId}`);

		}

	});



	socket.on("disconnect", () => {

		console.log(`Socket disconnected: ${socket.id}`);

	});

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

// --- feature routers ---

// each domain router lives in `api/routes/<domain>`.  keep them small; business

// logic should be factored into models or service helpers.  routes are mounted

// with any required middleware at the top level so that capabilities are

// consistently applied.

app.use("/api/subscribers", subscriberRoutes);

app.use("/api/notifications", createNotificationRoutes(realtimeDispatcher));

app.use("/api/chat", createChatRoutes(realtimeDispatcher));

app.use("/api/stream", createStreamRoutes(realtimeDispatcher));

app.use("/api/ai", require("./routes/ai"));



// -----------------------------

// Uploads (multer)

//

// lightweight file service used by blog posts, stream composer, and later

// chat/attachment flows.  The endpoint is guarded by

// `requireCapabilities("stream:create")` so any user who can post to the

// stream may also upload files.  This replaces the earlier `requireAdminOrAuthor`

// restriction and ensures normal members can attach media.  See

// `docs/architecture/` for detailed guidelines.

// -----------------------------

const multer = require("multer");

const { v4: uuidv4 } = require("uuid");



const uploadsDir =
	process.env.UPLOADS_DIR ||
	(process.env.VERCEL ? "/tmp" : path.join(projectRoot, "public", "uploads"));



if (!process.env.VERCEL && !fs.existsSync(uploadsDir)) {

	try {

		fs.mkdirSync(uploadsDir, { recursive: true });

	} catch (e) {

		console.warn("[multer] Could not create uploads dir.");

	}

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

	// allow any user who can create stream posts (all authenticated users by default)

	requireCapabilities("stream:create"),

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



// SPA fallback: for any non-API GET request that isn't handled above, serve index.html

// This lets client-side routing (React Router) handle deep links such as /user/search or

// /blog/123 (desktop search is handled by the same React router). API routes still fall through

// to default 404.

app.get("*", (req, res, next) => {

    if (req.method !== "GET" || req.path.startsWith("/api")) {

        return next();

    }

    const indexPath = path.join(projectRoot, "public", "index.html");

    if (fs.existsSync(indexPath)) {

        res.sendFile(indexPath);

    } else {

        // no frontend built yet; return 404 so tests can assert appropriately

        res.status(404).json({ error: "Not found", path: req.originalUrl });

    }

});



// -----------------------------

// Note: Socket event handlers removed for Pusher migration

// -----------------------------



// Health check

app.get("/api/pusher/test", (req, res) => {

	res.status(200).json({ success: true, message: "Pusher is configured!" });

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

// Start server

// -----------------------------

if (require.main === module) {

	// Use http server to support Socket.io

	server.listen(port, () => {

		console.log(`Server (Hybrid) is running on port ${port}`);

	});

}


module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = io;
module.exports.mongoose = mongoose;
