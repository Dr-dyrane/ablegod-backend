// api/routes/blog.js
const express = require("express");
const router = express.Router();
const BlogPost = require("../models/blog");

// Routes
router.get("/", async (req, res) => {
	try {
		const posts = await BlogPost.find();
		res.json(posts);
	} catch (error) {
		console.error("Error fetching posts:", error);
		res.status(500).json({ error: "Error fetching posts" });
	}
});

router.post("/", async (req, res) => {
	try {
		const newPost = new BlogPost(req.body);
		const savedPost = await newPost.save();
		res.status(201).json(savedPost);
	} catch (error) {
		console.error("Error creating post:", error);
		res.status(500).json({ error: "Error creating post" });
	}
});

router.get("/subcategory/:subcategory", async (req, res) => {
	const { subcategory } = req.params;
	try {
		const posts = await BlogPost.find({ subcategory });
		res.json(posts);
	} catch (error) {
		console.error("Error fetching posts by subcategory:", error);
		res.status(500).json({ error: "Error fetching posts by subcategory" });
	}
});

router.put("/:id", async (req, res) => {
	try {
		const post = await BlogPost.findOne({ id: Number(req.params.id) });
		if (!post) {
			return res.status(404).json({ error: "Post not found" });
		}

		const updatedPost = await BlogPost.findByIdAndUpdate(
			post._id,
			{ ...req.body },
			{ new: true }
		);
		res.json(updatedPost);
	} catch (error) {
		console.error("Error updating post:", error);
		res.status(500).json({ error: "Error updating post" });
	}
});

router.delete("/:id", async (req, res) => {
	try {
		const post = await BlogPost.findOne({ id: Number(req.params.id) });
		if (!post) {
			return res.status(404).json({ error: "Post not found" });
		}

		await BlogPost.findByIdAndDelete(post._id); // Use _id for deletion
		res.json({ message: "Post deleted successfully" });
	} catch (error) {
		console.error("Error deleting post:", error);
		res.status(500).json({ error: "Error deleting post" });
	}
});

// Like Route
router.post("/:id/like", async (req, res) => {
	try {
		const post = await BlogPost.findOne({ id: Number(req.params.id) });
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

router.delete("/:id/like", async (req, res) => {
	try {
		const post = await BlogPost.findOne({ id: Number(req.params.id) });
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
router.post("/:id/comments", async (req, res) => {
	try {
		const post = await BlogPost.findOne({ id: Number(req.params.id) });
		if (post) {
			const newComment = {
				id: Date.now(),
				...req.body,
				date: new Date().toLocaleDateString(),
			};
			post.comments.push(newComment);
			await post.save();
			res.status(201).json(newComment);
		} else {
			res.status(404).json({ error: "Post not found" });
		}
	} catch (error) {
		console.error("Error adding comment to blog post:", error);
		res.status(500).json({ error: "Error adding comment to blog post" });
	}
});

router.get("/:id/comments", async (req, res) => {
	try {
		const post = await BlogPost.findOne({ id: Number(req.params.id) });
		if (post) {
			res.json(post.comments);
		} else {
			res.status(404).json({ error: "Post not found" });
		}
	} catch (error) {
		console.error("Error fetching comments:", error);
		res.status(500).json({ error: "Error fetching comments" });
	}
});

router.get("/tags/:tag", async (req, res) => {
	const { tag } = req.params;
	try {
		const posts = await BlogPost.find({ tags: { $in: [tag] } });
		res.json(posts);
	} catch (error) {
		console.error("Error fetching posts by tag:", error);
		res.status(500).json({ error: "Error fetching posts by tag" });
	}
});

router.get("/tags", async (req, res) => {
	try {
		const tags = await BlogPost.distinct("tags");
		res.json(tags);
	} catch (error) {
		console.error("Error fetching distinct tags:", error);
		res.status(500).json({ error: "Error fetching distinct tags" });
	}
});

module.exports = router;
