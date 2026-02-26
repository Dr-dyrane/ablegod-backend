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

// Debug route - with environment info
app.get('/api/debug', (req, res) => {
  const databaseUrl = process.env.DATABASE_URL || '';
  
  res.json({
    message: 'Debug route working - v2',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    env: {
      DATABASE_URL: databaseUrl ? databaseUrl.substring(0, 50) + '...' : 'NOT_SET',
      DATABASE_URL_LENGTH: databaseUrl.length,
      JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT_SET',
      NODE_ENV: process.env.NODE_ENV || 'undefined'
    },
    neonConnected: !!sql,
    usingMockData: !sql
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

// MongoDB Connection (test first, then backup to Neon)
const mongoose = require('mongoose');
let sql;

const connectDB = async () => {
  try {
    // First try MongoDB (for testing)
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://dyrane:ableGoddbkey@ablegod.wyrvp.mongodb.net/?retryWrites=true&w=majority&appName=ableGod';
    console.log('🔄 Testing MongoDB connection...');
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
      bufferCommands: false,
      bufferMaxEntries: 0,
    });
    
    console.log('✅ MongoDB connected successfully!');
    
    // If MongoDB works, also connect to Neon for backup
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      try {
        const { neon } = require('@neondatabase/serverless');
        sql = neon(databaseUrl);
        console.log('🎉 Neon backup connected successfully!');
        
        // Test the connection
        const result = await sql`SELECT NOW()`;
        console.log('✅ Neon backup test query successful:', result[0]);
      } catch (neonError) {
        console.log('❌ Neon backup failed:', neonError.message);
      }
    }
    
  } catch (mongoError) {
    console.log('❌ MongoDB connection failed:', mongoError.message);
    console.log('🔄 Using mock data for stability');
  }
};

connectDB();

// Blog Post Schema for Neon
const createBlogPostsTable = async () => {
  if (!sql) return;
  
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        excerpt TEXT,
        content TEXT,
        category TEXT,
        subcategory TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_time TEXT,
        comments JSONB DEFAULT '[]',
        image TEXT,
        author TEXT,
        status TEXT DEFAULT 'draft',
        likes INTEGER DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        tags JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✅ Blog posts table ready');
    
    // Add sample data if table is empty
    const existingPosts = await sql`SELECT COUNT(*) as count FROM blog_posts`;
    if (existingPosts[0].count === 0) {
      console.log('📝 Adding sample data to Neon...');
      await sql`
        INSERT INTO blog_posts (id, title, excerpt, content, category, subcategory, read_time, image, author, status, likes, downloads, tags)
        VALUES 
          (1, 'Getting Started with Web Development', 'A comprehensive guide to begin your journey in web development', 'Web development is an exciting field that combines creativity with technical skills...', 'Technology', 'Web Dev', '5 min read', 'https://via.placeholder.com/300x200', 'Chris Tan', 'published', 42, 15, '["web development", "beginner", "tutorial"]'),
          (2, 'Understanding CORS in Modern Web Apps', 'Learn how Cross-Origin Resource Sharing works and how to configure it properly', 'CORS is a security mechanism that browsers implement to protect users...', 'Technology', 'Security', '8 min read', 'https://via.placeholder.com/300x200', 'Chris Tan', 'published', 28, 8, '["cors", "security", "web development"]')
      `;
      console.log('✅ Sample data added to Neon');
    }
  } catch (error) {
    console.log('❌ Table creation failed:', error.message);
  }
};

createBlogPostsTable();

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
  featured: { type: Boolean, default: false }
}));

// Posts endpoint - test MongoDB first, backup to Neon
app.get('/api/posts', async (req, res) => {
  try {
    console.log('Posts endpoint called - testing MongoDB first...');
    
    // Try MongoDB first (primary)
    if (mongoose.connection.readyState === 1) {
      console.log('Querying MongoDB...');
      const BlogPost = mongoose.model('BlogPost', new mongoose.Schema({
        id: Number,
        title: String,
        excerpt: String,
        content: String,
        category: String,
        subcategory: String,
        date: String,
        readTime: String,
        comments: [String],
        image: String,
        author: String,
        status: String,
        likes: Number,
        downloads: Number,
        tags: [String],
        featured: { type: Boolean, default: false }
      }));
      
      const posts = await BlogPost.find().lean();
      if (posts && posts.length > 0) {
        console.log('✅ MongoDB query successful:', posts.length, 'posts');
        
        // Backup to Neon
        if (sql) {
          console.log('🔄 Backing up to Neon...');
          await backupToNeon(posts);
        }
        
        return res.json(posts);
      }
    }
    
    // Try Neon backup
    if (sql) {
      console.log('Querying Neon backup...');
      const posts = await sql`SELECT * FROM blog_posts WHERE status = 'published' ORDER BY created_at DESC`;
      if (posts && posts.length > 0) {
        console.log('✅ Neon backup query successful:', posts.length, 'posts');
        return res.json(posts);
      }
    }
    
    // Fallback to mock data
    console.log('Using mock data - no database connections available');
    res.json(mockPosts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Error fetching posts' });
  }
});

// Backup function for Neon
const backupToNeon = async (posts) => {
  try {
    // Create table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        excerpt TEXT,
        content TEXT,
        category TEXT,
        subcategory TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_time TEXT,
        comments JSONB DEFAULT '[]',
        image TEXT,
        author TEXT,
        status TEXT DEFAULT 'draft',
        likes INTEGER DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        tags JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    // Clear and insert posts
    await sql`DELETE FROM blog_posts`;
    
    for (const post of posts) {
      await sql`
        INSERT INTO blog_posts (
          id, title, excerpt, content, category, subcategory, 
          date, read_time, comments, image, author, status, 
          likes, downloads, tags
        ) VALUES (
          ${post.id}, ${post.title}, ${post.excerpt}, 
          ${post.content}, ${post.category}, ${post.subcategory},
          ${post.date ? new Date(post.date) : new Date()}, ${post.readTime}, 
          ${JSON.stringify(post.comments || [])}, ${post.image}, ${post.author}, 
          ${post.status || 'published'}, ${post.likes || 0}, ${post.downloads || 0}, 
          ${JSON.stringify(post.tags || [])}
        )
      `;
    }
    
    console.log('✅ Successfully backed up', posts.length, 'posts to Neon');
  } catch (error) {
    console.log('❌ Backup to Neon failed:', error.message);
  }
};

// Get single post by ID
app.get('/api/posts/:id', async (req, res) => {
  try {
    if (sql) {
      // Try Neon database first
      const posts = await sql`SELECT * FROM blog_posts WHERE id = ${req.params.id}`;
      if (posts && posts.length > 0) {
        return res.json(posts[0]);
      }
    }
    
    // Fallback to mock data
    const post = mockPosts.find(p => p.id === parseInt(req.params.id));
    if (post) {
      res.json(post);
    } else {
      res.status(404).json({ error: 'Post not found' });
    }
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: 'Error fetching post' });
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
// Socket.io (simplified for Vercel - disabled for now)
// -----------------------------
// Note: Socket.io requires server instance which doesn't work well with serverless Vercel
// We'll add this back when we have proper serverless WebSocket setup

// Health check for Socket.io (mock)
app.get("/socket.io/test", (req, res) => {
  res.status(200).json({ success: true, message: "WebSocket endpoint configured (disabled for Vercel)" });
});

// -----------------------------
// Google Analytics (simplified)
// -----------------------------
const { google } = require('googleapis');

app.get('/api/analytics', async (req, res) => {
  try {
    // Mock analytics data for now
    const mockAnalytics = [
      {
        date: '2024-01-20',
        pageTitle: 'Getting Started with Web Development',
        metrics: {
          totalUsers: 150,
          newUsers: 45,
          sessions: 200,
          pageViews: 450
        }
      }
    ];
    res.json(mockAnalytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Error fetching analytics' });
  }
});

app.get('/api/currently-online', async (req, res) => {
  try {
    // Mock real-time data
    res.json({ currentlyOnline: Math.floor(Math.random() * 20) + 5 });
  } catch (error) {
    console.error('Error fetching online users:', error);
    res.status(500).json({ error: 'Error fetching online users' });
  }
});

// -----------------------------
// Subscriber routes
// -----------------------------
app.post('/api/subscribers', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Mock subscriber creation
    console.log('New subscriber:', email);
    res.status(201).json({ message: 'Successfully subscribed!', email });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({ error: 'Error subscribing' });
  }
});

app.get('/api/subscribers', async (req, res) => {
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

    // Mock subscribers
    const subscribers = [
      { id: 1, email: 'user1@example.com', status: 'active', createdAt: '2024-01-15' },
      { id: 2, email: 'user2@example.com', status: 'active', createdAt: '2024-01-16' }
    ];
    res.json(subscribers);
  } catch (error) {
    console.error('Error fetching subscribers:', error);
    res.status(500).json({ error: 'Error fetching subscribers' });
  }
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
  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app;
