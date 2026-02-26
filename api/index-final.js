const express = require('express');
const cors = require('cors');

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

// Posts endpoint with mock data
app.get('/api/posts', (req, res) => {
  res.json(mockPosts);
});

// Get single post by ID
app.get('/api/posts/:id', (req, res) => {
  const post = mockPosts.find(p => p.id === parseInt(req.params.id));
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  res.json(post);
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
