// api/index.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

// Socket.io imports
const http = require("http");
const { Server } = require("socket.io");
const { exec } = require("child_process");

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json()); // To handle JSON requests

// MongoDB Connection
mongoose
	.connect(process.env.MONGODB_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	})
	.then(() => console.log("MongoDB connected"))
	.catch((err) => console.error("MongoDB connection error:", err));

// Socket.io connection
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
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

// Notification Route for Testing
app.post("/api/notify", (req, res) => {
	const { message, userId } = req.body;

	// Send the notification to all users or a specific user
	if (userId) {
		io.to(userId).emit("receiveNotification", { message });
	} else {
		io.emit("receiveNotification", { message });
	}

	res.status(200).json({ success: true, message: "Notification sent" });
});

// Start the Server
server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
