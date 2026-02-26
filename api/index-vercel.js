const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:8080',
    'http://localhost:3000',
    'http://192.168.1.197:8080',
    'https://www.chistanwrites.blog',
    'https://chistanwrites.blog',
    /\.vercel\.app$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// MongoDB Connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://dyrane:ableGoddbkey@ablegod.wyrvp.mongodb.net/?retryWrites=true&w=majority&appName=ableGod';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};

connectDB();

// Blog Post Model
const BlogPost = mongoose.model('BlogPost', new mongoose.Schema({
  id: Number,
  title: String,
  excerpt: String,
  content: String,
  category: String,
  subcategory: String,
  date: String,
  readTime: String,
  comments: [{
    id: Number,
    text: String,
    author: String,
    date: String,
  }],
  image: String,
  author: String,
  status: String,
  likes: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  tags: [String],
}));

// Debug route - no database dependency
app.get('/api/debug', (req, res) => {
  res.json({
    message: 'Debug route working',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Real posts endpoint with database
app.get('/api/posts', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const posts = await BlogPost.find().lean();
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Error fetching posts', details: error.message });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

module.exports = app;
