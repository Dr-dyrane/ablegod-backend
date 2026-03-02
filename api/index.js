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

const mongoRuntime =
	globalThis.__ABLEGOD_MONGO_RUNTIME__ || {
		connectPromise: null,
		lastError: null,
		lastConnectedAt: null,
		activeConnectionLabel: null,
		attemptedConnectionLabels: [],
	};
globalThis.__ABLEGOD_MONGO_RUNTIME__ = mongoRuntime;

const MONGO_READY_STATE_LABELS = {
	0: "disconnected",
	1: "connected",
	2: "connecting",
	3: "disconnecting",
};

function getMongoReadyStateLabel() {
	return MONGO_READY_STATE_LABELS[mongoose.connection.readyState] || "unknown";
}

function getMongoConnectionCandidates() {
	const primaryUri = String(process.env.MONGODB_URI || "").trim();
	const secondaryUri = String(
		process.env.MONGODB_URI_FALLBACK || process.env.MONGODB_URI_SECONDARY || ""
	).trim();
	const candidates = [];

	if (primaryUri) candidates.push({ label: "primary", uri: primaryUri });
	if (secondaryUri && secondaryUri !== primaryUri) {
		candidates.push({ label: "secondary", uri: secondaryUri });
	}

	return candidates;
}

async function ensureMongoConnection() {
	if (mongoose.connection.readyState === 1) return mongoose.connection;

	const candidates = getMongoConnectionCandidates();
	if (candidates.length === 0) {
		const error = new Error("MONGODB_URI is not configured");
		error.code = "MONGO_URI_MISSING";
		throw error;
	}

	if (!mongoRuntime.connectPromise) {
		mongoRuntime.connectPromise = (async () => {
			let lastError = null;

			for (let index = 0; index < candidates.length; index += 1) {
				const candidate = candidates[index];
				try {
					if (index > 0 && mongoose.connection.readyState !== 0) {
						await mongoose.disconnect().catch(() => undefined);
					}
					if (!mongoRuntime.attemptedConnectionLabels.includes(candidate.label)) {
						mongoRuntime.attemptedConnectionLabels.push(candidate.label);
					}
					const conn = await mongoose.connect(candidate.uri, {
						serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
					});
					mongoRuntime.lastError = null;
					mongoRuntime.lastConnectedAt = new Date().toISOString();
					mongoRuntime.activeConnectionLabel = candidate.label;
					console.log(`MongoDB connected (${candidate.label})`);
					return conn;
				} catch (error) {
					lastError = error;
					mongoRuntime.lastError = error;
					console.warn(`[MongoDB] Connection attempt failed (${candidate.label}):`, error?.message || error);
				}
			}

			throw lastError || new Error("Unable to connect to MongoDB");
		})()
			.catch((error) => {
				mongoRuntime.lastError = error;
				mongoRuntime.connectPromise = null;
				throw error;
			});
	}

	return mongoRuntime.connectPromise;
}



// Debug route
app.get("/api/debug", async (req, res) => {
	let connectionCheck = "not_attempted";
	try {
		await ensureMongoConnection();
		connectionCheck = "connected";
	} catch (_error) {
		connectionCheck = "failed";
	}

	res.json({
		message: "Debug route working - MongoDB Check",
		origin: req.headers.origin,
		timestamp: new Date().toISOString(),
		mongodb: {
			readyState: mongoose.connection.readyState,
			readyStateLabel: getMongoReadyStateLabel(),
			host: mongoose.connection.host || "Not connected",
			name: mongoose.connection.name || "Not connected",
			connectionCheck,
			activeConnectionLabel: mongoRuntime.activeConnectionLabel,
			attemptedConnectionLabels: mongoRuntime.attemptedConnectionLabels,
			lastConnectedAt: mongoRuntime.lastConnectedAt,
			lastError: mongoRuntime.lastError ? String(mongoRuntime.lastError.message || mongoRuntime.lastError) : null,
		},
		env: {
			hasMongodbUri: !!process.env.MONGODB_URI,
			mongodbUriLength: process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0,
			hasMongodbFallbackUri: Boolean(process.env.MONGODB_URI_FALLBACK || process.env.MONGODB_URI_SECONDARY),
			hasJwtSecret: Boolean(process.env.JWT_SECRET),
			nodeEnv: process.env.NODE_ENV || "development",
		},
	});
});



// -----------------------------

// MongoDB connection (guarded)

// -----------------------------

if (!process.env.MONGODB_URI && !process.env.MONGODB_URI_FALLBACK && !process.env.MONGODB_URI_SECONDARY) {

	console.warn("[MongoDB] Missing MONGODB_URI and fallback URIs - server will likely fail DB routes.");

} else {

	ensureMongoConnection().catch((err) => console.error("MongoDB connection error:", err));

}

app.use("/api", async (req, res, next) => {
	if (req.path === "/debug" || req.path === "/pusher/test") {
		return next();
	}

	try {
		await ensureMongoConnection();
		return next();
	} catch (error) {
		const message =
			process.env.NODE_ENV === "production"
				? "Service temporarily unavailable. Database is reconnecting."
				: `Service temporarily unavailable. Database is reconnecting. (${String(error?.message || "unknown error")})`;
		return res.status(503).json({
			success: false,
			message,
			code: "DB_UNAVAILABLE",
		});
	}
});



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
			const roomName = `user-${userId}`;
			if (!socket.rooms.has(roomName)) {
				socket.join(roomName);
				console.log(`Socket ${socket.id} joined ${roomName}`);
			}

		}

	});



	socket.on("joinConversationRoom", (data) => {

		const conversationId = typeof data === "string" ? data : data?.conversationId;

		if (conversationId) {
			const roomName = `conversation-${conversationId}`;
			if (!socket.rooms.has(roomName)) {
				socket.join(roomName);
				console.log(`Socket ${socket.id} joined ${roomName}`);
			}

		}

	});

	socket.on("leaveUserRoom", (data) => {
		const userId = typeof data === "string" ? data : data?.userId;
		if (userId) {
			socket.leave(`user-${userId}`);
		}
	});

	socket.on("leaveConversationRoom", (data) => {
		const conversationId = typeof data === "string" ? data : data?.conversationId;
		if (conversationId) {
			socket.leave(`conversation-${conversationId}`);
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

const mediaRoutes = require("./routes/media");

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

app.use("/api/media", mediaRoutes);

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



function getDateRange(range, explicitStartDate, explicitEndDate) {

	if (explicitStartDate && explicitEndDate) {

		return {

			startDate: String(explicitStartDate),

			endDate: String(explicitEndDate),

		};

	}

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
		const explicitStartDate = req.query.startDate;
		const explicitEndDate = req.query.endDate;

		const { startDate, endDate } = getDateRange(range, explicitStartDate, explicitEndDate);



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

