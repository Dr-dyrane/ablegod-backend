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

// Mock blog posts data (temporary solution)
const mockPosts = [
  {
    _id: '1',
    id: 1,
    title: 'Getting Started with Web Development',
    excerpt: 'A comprehensive guide to begin your journey in web development',
    content: 'Web development is an exciting field that combines creativity with technical skills...',
    category: 'Technology',
    subcategory: 'Web Dev',
    date: '2024-01-15',
    readTime: '5 min read',
    comments: [],
    image: 'https://via.placeholder.com/300x200',
    author: 'Chris Tan',
    status: 'published',
    likes: 42,
    downloads: 15,
    tags: ['web development', 'beginner', 'tutorial']
  },
  {
    _id: '2',
    id: 2,
    title: 'Understanding CORS in Modern Web Apps',
    excerpt: 'Learn how Cross-Origin Resource Sharing works and how to configure it properly',
    content: 'CORS is a security mechanism that browsers implement to protect users...',
    category: 'Technology',
    subcategory: 'Security',
    date: '2024-01-10',
    readTime: '8 min read',
    comments: [],
    image: 'https://via.placeholder.com/300x200',
    author: 'Chris Tan',
    status: 'published',
    likes: 28,
    downloads: 8,
    tags: ['cors', 'security', 'web development']
  }
];

// Debug route
app.get('/api/debug', (req, res) => {
  res.json({
    message: 'Debug route working',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

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

// Posts endpoint with database fallback to mock
app.get('/api/posts', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      // Try database first
      const posts = await BlogPost.find().lean();
      if (posts && posts.length > 0) {
        return res.json(posts);
      }
    }
    
    // Fallback to mock data if DB fails or empty
    console.log('Using mock data - DB not connected or empty');
    res.json(mockPosts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    // Fallback to mock data on error
    res.json(mockPosts);
  }
});

// Get single post by ID
app.get('/api/posts/:id', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      // Try database first
      const post = await BlogPost.findOne({ id: parseInt(req.params.id) }).lean();
      if (post) {
        return res.json(post);
      }
    }
    
    // Fallback to mock data
    const post = mockPosts.find(p => p.id === parseInt(req.params.id));
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    // Fallback to mock data on error
    const post = mockPosts.find(p => p.id === parseInt(req.params.id));
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(post);
  }
});

// Add authentication routes (basic version)
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Simple user schema for auth
const User = mongoose.model('User', new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: { type: String, default: 'user' }
}));

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (mongoose.connection.readyState === 1) {
      // Try database auth
      const user = await User.findOne({ email }).lean();
      if (user && await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'fallback-secret');
        return res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
      }
    }
    
    // Fallback mock auth
    if (email === 'admin@chistanwrites.blog' && password === 'admin123') {
      const token = jwt.sign({ id: 'mock-admin', email, role: 'admin' }, process.env.JWT_SECRET || 'fallback-secret');
      return res.json({ token, user: { id: 'mock-admin', email, role: 'admin' } });
    }
    
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (mongoose.connection.readyState === 1) {
      // Check if user exists
      const existingUser = await User.findOne({ email }).lean();
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }
      
      // Create new user
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({ username, email, password: hashedPassword });
      await user.save();
      
      const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'fallback-secret');
      return res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
    }
    
    // Fallback response
    res.status(503).json({ error: 'Registration service unavailable' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
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
