// api/index.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

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

// Start the Server
app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
