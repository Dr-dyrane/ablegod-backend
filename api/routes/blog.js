// api/routes/blog.js
const express = require("express");
const router = express.Router();
const BlogPost = require("../models/blog");
const Subscriber = require("../models/subscriber");
const { sendNewsletterEmail } = require("../../utils/mailer");
const { requireAdminOrAuthor } = require("../middleware/auth");

const isStreamPostPayload = (payload = {}) => {
	try {
		const subcategory = String(payload.subcategory || "").trim().toLowerCase();
		if (subcategory === "stream") return true;

		const category = String(payload.category || "").trim().toLowerCase();
		if (category.includes("stream")) return true;

		const tags = Array.isArray(payload.tags) ? payload.tags : [];
		return tags.some((tag) => String(tag || "").trim().toLowerCase() === "stream");
	} catch {
		return false;
	}
};

async function dispatchNewsletterToSubscribers({
	subscribers,
	title,
	excerpt,
	postUrl,
	image,
	req,
}) {
	if (!Array.isArray(subscribers) || subscribers.length === 0) {
		return { delivered: 0, failed: 0 };
	}

	const sendResults = await Promise.allSettled(
		subscribers.map((subscriber) =>
			sendNewsletterEmail(
				subscriber.email,
				title,
				excerpt,
				postUrl,
				image,
				req
			)
		)
	);

	const delivered = sendResults.filter((result) => result.status === "fulfilled").length;
	const failed = sendResults.length - delivered;
	if (failed > 0) {
		console.warn(`[newsletter] Delivery failures detected: ${failed}/${sendResults.length}`);
	}
	return { delivered, failed };
}

// Routes
router.get("/", async (req, res) => {
	try {
		// allow simple keyword search via `q` query param
		const q = req.query.q ? String(req.query.q).trim() : null;
		let filter = {};
		if (q) {
			filter = {
				$or: [
					{ title: { $regex: q, $options: "i" } },
					{ content: { $regex: q, $options: "i" } },
					{ excerpt: { $regex: q, $options: "i" } },
				],
			};
		}
		const posts = await BlogPost.find(filter);
		res.json(posts);
	} catch (error) {
		console.error("Error fetching posts:", error);
		res.status(500).json({ error: "Error fetching posts" });
	}
});

router.post("/", ...requireAdminOrAuthor, async (req, res) => {
	try {
		const newPost = new BlogPost(req.body);
		const savedPost = await newPost.save();

		// ✅ Only send newsletter if status is explicitly 'published'
		if (req.body.status === 'published' && !isStreamPostPayload(req.body)) {
			const { title, excerpt, image } = req.body;
			const postUrl = `https://www.chistanwrites.blog/blog/${savedPost.id}`;

			// ✅ Get all subscriber emails from your database
			const subscribers = await Subscriber.find({ status: "active" });

			// ✅ Send newsletter and capture partial failures without crashing post creation
			await dispatchNewsletterToSubscribers({
				subscribers,
				title,
				excerpt,
				postUrl,
				image,
				req,
			});
		}

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

router.put("/:id", ...requireAdminOrAuthor, async (req, res) => {
	try {
		const post = await BlogPost.findOne({ id: Number(req.params.id) });
		if (!post) {
			return res.status(404).json({ error: "Post not found" });
		}

		const previousStatus = post.status;
		const updatedPost = await BlogPost.findByIdAndUpdate(
			post._id,
			{ ...req.body },
			{ new: true }
		);

		// ✅ Check if post is being published for the first time or re-published from a non-published state
		const newsletterPayload = {
			...(updatedPost && typeof updatedPost.toObject === "function"
				? updatedPost.toObject()
				: updatedPost || {}),
			...req.body,
		};
		if (
			previousStatus !== 'published' &&
			req.body.status === 'published' &&
			!isStreamPostPayload(newsletterPayload)
		) {
			const { title, excerpt, image } = updatedPost;
			const postUrl = `https://www.chistanwrites.blog/blog/${updatedPost.id}`;

			const subscribers = await Subscriber.find({ status: "active" });

			await dispatchNewsletterToSubscribers({
				subscribers,
				title,
				excerpt,
				postUrl,
				image,
				req,
			});
		}

		res.json(updatedPost);
	} catch (error) {
		console.error("Error updating post:", error);
		res.status(500).json({ error: "Error updating post" });
	}
});

router.delete("/:id", ...requireAdminOrAuthor, async (req, res) => {
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

router.get("/:id/downloads", async (req, res) => {
	try {
		const post = await BlogPost.findOne({ id: Number(req.params.id) });
		if (post) {
			res.json({
				downloads: post.downloads || 0,
			});
		} else {
			res.status(404).json({ error: "Post not found" });
		}
	} catch (error) {
		console.error("Error fetching download count:", error);
		res.status(500).json({ error: "Error fetching download count" });
	}
});

router.post("/:id/download", async (req, res) => {
	try {
		const post = await BlogPost.findOne({ id: Number(req.params.id) });
		if (post) {
			post.downloads += 1;
			await post.save();
			res.status(200).json({
				message: "Download tracked successfully",
				downloads: post.downloads,
			});
		} else {
			res.status(404).json({ error: "Post not found" });
		}
	} catch (error) {
		console.error("Error tracking blog post download:", error);
		res.status(500).json({ error: "Error tracking blog post download" });
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

router.get("/:id", async (req, res) => {
	try {
		const post = await BlogPost.findOne({ id: Number(req.params.id) });
		if (!post) {
			return res.status(404).json({ error: "Post not found" });
		}
		res.json(post);
	} catch (error) {
		console.error("Error fetching post:", error);
		res.status(500).json({ error: "Error fetching post" });
	}
});

module.exports = router;
