const mongoose = require('mongoose');
const { neon } = require('@neondatabase/serverless');

// MongoDB connection
const MONGODB_URI = 'mongodb+srv://dyrane:ableGoddbkey@ablegod.wyrvp.mongodb.net/?retryWrites=true&w=majority&appName=ableGod';

// Neon connection
const DATABASE_URL = 'postgresql://neondb_owner:npg_9U8AoCcQFNbR@ep-rough-sky-ainr3gma-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

// Blog Post Schema (same as your main index.js)
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

async function migrateData() {
  try {
    console.log('🚀 Starting migration from MongoDB to Neon...');
    
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Connect to Neon
    const sql = neon(DATABASE_URL);
    console.log('✅ Connected to Neon');
    
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
    console.log('✅ Blog posts table ready in Neon');
    
    // Clear existing data
    await sql`DELETE FROM blog_posts`;
    console.log('🧹 Cleared existing data from Neon');
    
    // Get all posts from MongoDB
    const mongoPosts = await BlogPost.find().lean();
    console.log(`📊 Found ${mongoPosts.length} posts in MongoDB`);
    
    if (mongoPosts.length === 0) {
      console.log('❌ No posts found in MongoDB to migrate');
      return;
    }
    
    // Transform and insert into Neon
    for (const post of mongoPosts) {
      const transformedPost = {
        id: post.id,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        category: post.category,
        subcategory: post.subcategory,
        date: post.date ? new Date(post.date) : new Date(),
        read_time: post.readTime,
        comments: JSON.stringify(post.comments || []),
        image: post.image,
        author: post.author,
        status: post.status || 'published',
        likes: post.likes || 0,
        downloads: post.downloads || 0,
        tags: JSON.stringify(post.tags || [])
      };
      
      await sql`
        INSERT INTO blog_posts (
          id, title, excerpt, content, category, subcategory, 
          date, read_time, comments, image, author, status, 
          likes, downloads, tags
        ) VALUES (
          ${transformedPost.id}, ${transformedPost.title}, ${transformedPost.excerpt}, 
          ${transformedPost.content}, ${transformedPost.category}, ${transformedPost.subcategory},
          ${transformedPost.date}, ${transformedPost.read_time}, ${transformedPost.comments}, 
          ${transformedPost.image}, ${transformedPost.author}, ${transformedPost.status},
          ${transformedPost.likes}, ${transformedPost.downloads}, ${transformedPost.tags}
        )
      `;
      
      console.log(`✅ Migrated post: ${post.title}`);
    }
    
    console.log(`🎉 Successfully migrated ${mongoPosts.length} posts to Neon!`);
    
    // Verify migration
    const neonPosts = await sql`SELECT COUNT(*) as count FROM blog_posts`;
    console.log(`📊 Neon now has ${neonPosts[0].count} posts`);
    
    // Close connections
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Run migration
migrateData();
