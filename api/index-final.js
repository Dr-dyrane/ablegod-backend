const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const projectRoot = path.resolve(__dirname, "..");

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

// -----------------------------
// File Uploads (multer)
// -----------------------------
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Use memory storage for serverless environments
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post(
  '/api/upload',
  async (req, res, next) => {
    // Simple auth check for upload
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
      if (!decoded || (decoded.role !== 'admin' && decoded.role !== 'author')) {
        return res.status(403).json({ error: 'Admin/Author access required' });
      }
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  },
  upload.single('image'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // For Vercel, return a mock URL or use a CDN service
    const url = `https://via.placeholder.com/300x200?text=Upload-${req.file.originalname}`;
    res.json({ url });
  }
);

// Serve static files
app.use(express.static(path.join(projectRoot, "public")));

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

// -----------------------------
// Socket.io (simplified for Vercel)
// -----------------------------
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:8080',
      'http://localhost:3000',
      'http://192.168.1.197:8080',
      'https://www.chistanwrites.blog',
      'https://chistanwrites.blog',
      /\.vercel\.app$/
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Socket auth middleware
io.use(async (socket, next) => {
  try {
    const authHeader = socket.handshake.headers?.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      socket.data.authContext = null;
      return next();
    }

    socket.data.authContext = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    return next();
  } catch (error) {
    console.warn("[socket] auth handshake failed:", error?.message || error);
    socket.data.authContext = null;
    return next();
  }
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  const getSocketUser = () => socket.data?.authContext || null;

  socket.on("sendNotification", (data) => {
    console.log(`Notification received: ${data?.message}`);
    io.emit("receiveNotification", data);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Health check for Socket.io
app.get("/socket.io/test", (req, res) => {
  res.status(200).json({ success: true, message: "WebSocket server is running!" });
});

// -----------------------------
// Additional Routes
// -----------------------------
// Categories endpoint
app.get('/api/categories', async (req, res) => {
  try {
    // Mock categories for now
    const categories = [
      { id: 1, name: 'Technology', slug: 'technology' },
      { id: 2, name: 'Web Development', slug: 'web-development' },
      { id: 3, name: 'Security', slug: 'security' }
    ];
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Error fetching categories' });
  }
});

// Users endpoint (basic)
app.get('/api/users', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Mock users
    const users = [
      { id: 'mock-admin', email: 'admin@chistanwrites.blog', role: 'admin' },
      { id: 'mock-author', email: 'author@chistanwrites.blog', role: 'author' }
    ];
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Error fetching users' });
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

// Start server (only if run directly)
if (require.main === module) {
  server.listen(process.env.PORT || 3001, () => {
    console.log(`Server is running on port ${process.env.PORT || 3001}`);
  });
}

module.exports = app;
