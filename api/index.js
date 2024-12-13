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

//Define Mongoose Schema
const blogPostSchema = new mongoose.Schema({
	id: Number, // Added the id field
	title: String,
	excerpt: String,
	content: String,
	category: String,
	date: String,
	readTime: String,
	comments: [
		{
			id: Number,
			text: String,
			author: String,
			date: String,
		},
	],
	image: String,
	author: String,
	status: String,
	likes: { type: Number, default: 0 },
});

//Define Mongoose Model
const BlogPost = mongoose.model("BlogPost", blogPostSchema);

// Routes
app.get("/api/posts", async (req, res) => {
	try {
		const posts = await BlogPost.find();
		res.json(posts);
	} catch (error) {
		res.status(500).json({ error: "Error fetching posts" });
	}
});

app.post("/api/posts", async (req, res) => {
	try {
		const newPost = new BlogPost(req.body);
		const savedPost = await newPost.save();
		res.status(201).json(savedPost);
	} catch (error) {
		res.status(500).json({ error: "Error creating post" });
	}
});

app.put("/api/posts/:id", async (req, res) => {
	try {
		const updatedPost = await BlogPost.findByIdAndUpdate(
			req.params.id,
			req.body,
			{ new: true }
		);
		res.json(updatedPost);
	} catch (error) {
		res.status(500).json({ error: "Error updating post" });
	}
});

app.delete("/api/posts/:id", async (req, res) => {
	try {
		await BlogPost.findByIdAndDelete(req.params.id);
		res.json({ message: "Post deleted successfully" });
	} catch (error) {
		res.status(500).json({ error: "Error deleting post" });
	}
});

// Like Route
app.post("/api/posts/:id/like", async (req, res) => {
	try {
		const post = await BlogPost.findById(req.params.id);
		if (post) {
			post.likes += 1;
			await post.save();
			res.status(200).json({ message: "Post liked successfully" });
		} else {
			res.status(404).json({ error: "Post not found" });
		}
	} catch (error) {
		console.error("Error liking blog post:", error);
		res.status(500).json({ error: "Error liking blog post" });
	}
});

app.delete("/api/posts/:id/like", async (req, res) => {
	try {
		const post = await BlogPost.findById(req.params.id);
		if (post && post.likes > 0) {
			post.likes -= 1;
			await post.save();
			res.status(200).json({ message: "Post unliked successfully" });
		} else {
			res.status(404).json({ error: "Post not found or has no likes" });
		}
	} catch (error) {
		console.error("Error unliking blog post:", error);
		res.status(500).json({ error: "Error unliking blog post" });
	}
});

// Comments Route
app.post("/api/posts/:id/comments", async (req, res) => {
	try {
		const post = await BlogPost.findById(req.params.id);
		if (post) {
			const newComment = {
				id: Date.now(),
				...req.body,
				date: new Date().toLocaleDateString(),
			};
			post.comments.push(newComment);
			await post.save();
			res.status(201).json(newComment); // Respond with the new comment
		} else {
			res.status(404).json({ error: "Post not found" });
		}
	} catch (error) {
		console.error("Error adding comment to blog post:", error);
		res.status(500).json({ error: "Error adding comment to blog post" });
	}
});

// Users Routes
const userSchema = new mongoose.Schema({
	id: Number, // Added the id field for users
	username: String,
	name: String,
	email: String,
	role: String,
	status: String,
	password: String,
	createdAt: String,
	lastLogin: String,
	activities: [
		{
			id: Number,
			type: String,
			timestamp: String,
			details: String,
		},
	],
});

const User = mongoose.model("User", userSchema);

app.get("/api/users", async (req, res) => {
	try {
		const users = await User.find();
		res.json(users);
	} catch (error) {
		res.status(500).json({ error: "Error fetching users" });
	}
});

app.post("/api/users", async (req, res) => {
	try {
		const newUser = new User(req.body);
		const savedUser = await newUser.save();
		res.status(201).json(savedUser);
	} catch (error) {
		res.status(500).json({ error: "Error creating user" });
	}
});

app.put("/api/users/:id", async (req, res) => {
	try {
		const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
			new: true,
		});
		res.json(updatedUser);
	} catch (error) {
		res.status(500).json({ error: "Error updating user" });
	}
});

app.delete("/api/users/:id", async (req, res) => {
	try {
		await User.findByIdAndDelete(req.params.id);
		res.json({ message: "User deleted successfully" });
	} catch (error) {
		res.status(500).json({ error: "Error deleting user" });
	}
});

// Categories Routes
const categorySchema = new mongoose.Schema({
	id: String,
	name: String,
});

const Category = mongoose.model("Category", categorySchema);

app.get("/api/categories", async (req, res) => {
	try {
		const categories = await Category.find();
		res.json(categories);
	} catch (error) {
		res.status(500).json({ error: "Error fetching categories" });
	}
});

app.post("/api/categories", async (req, res) => {
	try {
		const newCategory = new Category(req.body);
		const savedCategory = await newCategory.save();
		res.status(201).json(savedCategory);
	} catch (error) {
		res.status(500).json({ error: "Error creating category" });
	}
});

app.delete("/api/categories/:id", async (req, res) => {
	try {
		await Category.findOneAndDelete({ id: req.params.id });
		res.json({ message: "Category deleted successfully" });
	} catch (error) {
		res.status(500).json({ error: "Error deleting category" });
	}
});

// Login
app.post("/api/login", async (req, res) => {
	const { username, password } = req.body;
	try {
		const user = await User.findOne({ username });
		if (user && user.password === password) {
			res.json({
				success: true,
				message: "Login successful",
				user: {
					id: user.id,
					role: user.role,
				},
			});
		} else {
			res
				.status(401)
				.json({ success: false, message: "Invalid username or password" });
		}
	} catch (error) {
		res.status(500).json({ success: false, message: "Internal server error" });
	}
});

// Start the Server
app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
