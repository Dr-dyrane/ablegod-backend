// scripts/seed-stream-content.js
require('dotenv').config();
const mongoose = require('mongoose');

// Use the StreamPost model for consistency with the API
const StreamPost = require('../api/models/streamPost');

// Rich stream content with diverse topics
const seedPosts = [
  {
    id: 'post_001',
    author_user_id: 'user_001',
    author_name: 'Sarah Chen',
    author_role: 'user',
    intent: 'Reflection',
    title: 'The Art of Minimalist Design',
    content: 'Just finished a project that taught me the power of simplicity. Sometimes the most impactful designs come from removing elements rather than adding them. Less is truly more when it comes to user experience.',
    excerpt: 'Just finished a project that taught me the power of simplicity. Sometimes the most impactful designs come from removing elements rather than adding them.',
    status: 'published',
    like_count: 45,
    reply_count: 12,
    reaction_counts: { like: 45, amen: 8, pray: 12 },
    metadata: {
      tags: ['design', 'ux', 'minimalism'],
      display_author_name: 'Sarah Chen',
      created_date_label: new Date().toLocaleDateString(),
      estimated_read_time: '2 min'
    }
  },
  {
    id: 'post_002',
    author_user_id: 'user_002',
    author_name: 'Mike Johnson',
    author_role: 'user',
    intent: 'Reflection',
    title: 'React Hooks That Changed My Workflow',
    content: 'Been diving deep into React 18 features lately. The new concurrent rendering and useTransition hook have completely transformed how I handle heavy components. No more UI freezes during data loading!',
    excerpt: 'Been diving deep into React 18 features lately. The new concurrent rendering and useTransition hook have completely transformed how I handle heavy components.',
    status: 'published',
    like_count: 89,
    reply_count: 23,
    reaction_counts: { like: 89, amen: 15, pray: 23 },
    metadata: {
      tags: ['react', 'javascript', 'performance'],
      display_author_name: 'Mike Johnson',
      created_date_label: new Date().toLocaleDateString(),
      estimated_read_time: '3 min'
    }
  },
  {
    id: 'post_003',
    author_user_id: 'user_003',
    author_name: 'Emily Rodriguez',
    author_role: 'user',
    intent: 'Reflection',
    title: 'Finding Inspiration in Nature',
    content: 'Spent the weekend hiking and discovered amazing color palettes in the wild. Nature really is the best designer. Created a new brand identity based on sunset gradients I captured. 🌅',
    excerpt: 'Spent the weekend hiking and discovered amazing color palettes in the wild. Nature really is the best designer.',
    status: 'published',
    like_count: 156,
    reply_count: 34,
    reaction_counts: { like: 156, amen: 28, pray: 34 },
    metadata: {
      tags: ['design', 'inspiration', 'nature'],
      display_author_name: 'Emily Rodriguez',
      created_date_label: new Date().toLocaleDateString(),
      estimated_read_time: '2 min'
    }
  },
  {
    id: 'post_004',
    author_user_id: 'user_004',
    author_name: 'Alex Thompson',
    author_role: 'user',
    intent: 'Reflection',
    title: 'Building AI Tools That Actually Help',
    content: 'After months of development, finally launched my AI writing assistant. The key insight? Don\'t try to replace humans - augment them. The best tools make people better, not obsolete.',
    excerpt: 'After months of development, finally launched my AI writing assistant. The key insight? Don\'t try to replace humans - augment them.',
    status: 'published',
    like_count: 234,
    reply_count: 67,
    reaction_counts: { like: 234, amen: 45, pray: 67 },
    metadata: {
      tags: ['ai', 'startups', 'product'],
      display_author_name: 'Alex Thompson',
      created_date_label: new Date().toLocaleDateString(),
      estimated_read_time: '3 min'
    }
  },
  {
    id: 'post_005',
    author_user_id: 'user_005',
    author_name: 'Jessica Wang',
    author_role: 'user',
    intent: 'Reflection',
    title: 'Accessibility Isn\'t Optional',
    content: 'Ran an accessibility audit on our product and was shocked by what we missed. Color contrast, keyboard navigation, screen reader support - these aren\'t "nice to haves", they\'re essential. #a11y',
    excerpt: 'Ran an accessibility audit on our product and was shocked by what we missed. Color contrast, keyboard navigation, screen reader support.',
    status: 'published',
    like_count: 78,
    reply_count: 19,
    reaction_counts: { like: 78, amen: 12, pray: 19 },
    metadata: {
      tags: ['accessibility', 'ux', 'inclusive'],
      display_author_name: 'Jessica Wang',
      created_date_label: new Date().toLocaleDateString(),
      estimated_read_time: '2 min'
    }
  }
];

// Main seeding function
const seedStreamContent = async () => {
  try {
    console.log('📝 Starting stream content seeding...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ablegod');
    console.log('✅ Connected to MongoDB');
    
    // Clear existing posts - WARNING: This will delete ALL posts!
    console.log('\n⚠️  WARNING: This will DELETE ALL existing posts!');
    console.log('📝 This includes all real blog posts and user content!');
    console.log('💡 To cancel, press Ctrl+C within 10 seconds...');
    
    // Wait 10 seconds to allow cancellation
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('🧹 Proceeding with post clearance...');
    await StreamPost.deleteMany({});
    console.log('✅ Cleared all existing posts');
    
    // Add timestamps to posts
    const postsWithTimestamps = seedPosts.map((post, index) => ({
      ...post,
      created_at: new Date(Date.now() - (index * 2 * 60 * 60 * 1000)).toISOString(), // Spread over last 40 hours
      updated_at: new Date(Date.now() - (index * 2 * 60 * 60 * 1000)).toISOString()
    }));
    
    // Insert posts
    console.log('📄 Creating posts...');
    const createdPosts = await StreamPost.insertMany(postsWithTimestamps);
    console.log(`✅ Created ${createdPosts.length} posts`);
    
    // Display summary
    console.log('\n🎉 Stream content seeding completed successfully!');
    console.log('\n📊 Content Summary:');
    console.log(`   • Posts created: ${createdPosts.length}`);
    console.log(`   • Total likes: ${createdPosts.reduce((sum, post) => sum + (post.like_count || 0), 0)}`);
    console.log(`   • Total replies: ${createdPosts.reduce((sum, post) => sum + (post.reply_count || 0), 0)}`);
    console.log('\n🔥 Topics covered:');
    const allTags = createdPosts.flatMap(post => post.metadata?.tags || []);
    const uniqueTags = [...new Set(allTags)];
    console.log(`   • ${uniqueTags.length} unique tags: ${uniqueTags.join(', ')}`);
    
  } catch (error) {
    console.error('❌ Error seeding stream content:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the seeder
if (require.main === module) {
  seedStreamContent();
}

module.exports = { seedStreamContent, seedPosts };
