// api/models/blog.js
const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
    id: Number,
    title: String,
    excerpt: String,
    content: String,
    category: String,
    date: String,
    readTime: String,
    comments: {type: Number, default: 0},
    image: String,
    author: String,
    status: String,
    likes: { type: Number, default: 0 }
});

module.exports = mongoose.model('BlogPost', blogPostSchema);