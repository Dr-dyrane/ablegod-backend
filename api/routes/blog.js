// api/routes/blog.js
const express = require('express');
const router = express.Router();
const BlogPost = require('../models/blog');

// Routes
router.get("/", async (req, res) => {
    try {
        const posts = await BlogPost.find();
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: "Error fetching posts" });
    }
});

router.post("/", async (req, res) => {
    try {
        const newPost = new BlogPost(req.body);
        const savedPost = await newPost.save();
        res.status(201).json(savedPost);
    } catch (error) {
        res.status(500).json({ error: "Error creating post" });
    }
});

router.put("/:id", async (req, res) => {
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

router.delete("/:id", async (req, res) => {
    try {
        await BlogPost.findByIdAndDelete(req.params.id);
        res.json({ message: "Post deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Error deleting post" });
    }
});


// Like Route
router.post('/:id/like', async (req, res) => {
    try {
    const post = await BlogPost.findById(req.params.id);
    if (post) {
        post.likes += 1;
        await post.save();
        res.status(200).json({ message: 'Post liked successfully' });
    } else {
        res.status(404).json({ error: 'Post not found' });
    }
    } catch (error) {
    console.error("Error liking blog post:", error);
    res.status(500).json({ error: 'Error liking blog post' });
    }
});

router.delete('/:id/like', async (req, res) => {
    try {
    const post = await BlogPost.findById(req.params.id);
    if (post && post.likes > 0) {
        post.likes -= 1;
        await post.save();
        res.status(200).json({ message: 'Post unliked successfully' });
    } else {
        res.status(404).json({ error: 'Post not found or has no likes' });
    }
    } catch (error) {
    console.error("Error unliking blog post:", error);
        res.status(500).json({ error: 'Error unliking blog post' });
    }
});


// Comments Route
router.post('/:id/comments', async (req, res) => {
    try {
        const post = await BlogPost.findById(req.params.id);
        if (post) {
            const newComment = {
                id: Date.now(),
                ...req.body,
                date: new Date().toLocaleDateString()
            };
            post.comments += 1;
            await post.save();
            res.status(201).json(newComment);
        } else {
            res.status(404).json({ error: 'Post not found' });
        }
    } catch (error) {
        console.error("Error adding comment to blog post:", error);
        res.status(500).json({ error: 'Error adding comment to blog post' });
    }
});

module.exports = router;