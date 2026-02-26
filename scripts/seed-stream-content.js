// scripts/seed-stream-content.js
require('dotenv').config();
const mongoose = require('mongoose');

// Check if Post model exists, if not create a simple one
let Post;
try {
  Post = require('../api/models/post');
} catch (error) {
  // Create a simple Post schema if it doesn't exist
  const postSchema = new mongoose.Schema({
    id: String,
    user_id: String,
    content: String,
    title: String,
    type: { type: String, default: 'reflection' },
    tags: [String],
    likes_count: { type: Number, default: 0 },
    comments_count: { type: Number, default: 0 },
    shares_count: { type: Number, default: 0 },
    created_at: String,
    updated_at: String,
    status: { type: String, default: 'published' }
  });
  Post = mongoose.model('Post', postSchema);
}

// Rich stream content with diverse topics
const seedPosts = [
  {
    id: 'post_001',
    user_id: 'user_001',
    title: 'The Art of Minimalist Design',
    content: 'Just finished a project that taught me the power of simplicity. Sometimes the most impactful designs come from removing elements rather than adding them. Less is truly more when it comes to user experience.',
    type: 'reflection',
    tags: ['design', 'ux', 'minimalism'],
    likes_count: 45,
    comments_count: 12,
    shares_count: 8
  },
  {
    id: 'post_002',
    user_id: 'user_002',
    title: 'React Hooks That Changed My Workflow',
    content: 'Been diving deep into React 18 features lately. The new concurrent rendering and useTransition hook have completely transformed how I handle heavy components. No more UI freezes during data loading!',
    type: 'reflection',
    tags: ['react', 'javascript', 'performance'],
    likes_count: 89,
    comments_count: 23,
    shares_count: 15
  },
  {
    id: 'post_003',
    user_id: 'user_003',
    title: 'Finding Inspiration in Nature',
    content: 'Spent the weekend hiking and discovered amazing color palettes in the wild. Nature really is the best designer. Created a new brand identity based on sunset gradients I captured. 🌅',
    type: 'reflection',
    tags: ['design', 'inspiration', 'nature'],
    likes_count: 156,
    comments_count: 34,
    shares_count: 28
  },
  {
    id: 'post_004',
    user_id: 'user_004',
    title: 'Building AI Tools That Actually Help',
    content: 'After months of development, finally launched my AI writing assistant. The key insight? Don\'t try to replace humans - augment them. The best tools make people better, not obsolete.',
    type: 'reflection',
    tags: ['ai', 'startups', 'product'],
    likes_count: 234,
    comments_count: 67,
    shares_count: 45
  },
  {
    id: 'post_005',
    user_id: 'user_005',
    title: 'Accessibility Isn\'t Optional',
    content: 'Ran an accessibility audit on our product and was shocked by what we missed. Color contrast, keyboard navigation, screen reader support - these aren\'t "nice to haves", they\'re essential. #a11y',
    type: 'reflection',
    tags: ['accessibility', 'ux', 'inclusive'],
    likes_count: 78,
    comments_count: 19,
    shares_count: 12
  },
  {
    id: 'post_006',
    user_id: 'user_006',
    title: 'The Hidden Beauty of Data Visualization',
    content: 'Transformed a complex dataset into an interactive dashboard today. There\'s something magical about turning raw numbers into stories that anyone can understand. Data viz is where art meets science.',
    type: 'reflection',
    tags: ['data', 'visualization', 'python'],
    likes_count: 112,
    comments_count: 28,
    shares_count: 22
  },
  {
    id: 'post_007',
    user_id: 'user_007',
    title: 'Content Marketing in 2024',
    content: 'The landscape has changed dramatically. Short-form video, AI-generated content, authentic storytelling - what worked last year might not work today. Adaptability is the new superpower for marketers.',
    type: 'reflection',
    tags: ['marketing', 'content', 'strategy'],
    likes_count: 189,
    comments_count: 45,
    shares_count: 34
  },
  {
    id: 'post_008',
    user_id: 'user_008',
    title: 'Infrastructure as Code Revolution',
    content: 'Just automated our entire deployment pipeline with Terraform and GitHub Actions. What used to take hours now happens in minutes. The future of DevOps is declarative, not imperative.',
    type: 'reflection',
    tags: ['devops', 'infrastructure', 'automation'],
    likes_count: 67,
    comments_count: 15,
    shares_count: 9
  },
  {
    id: 'post_009',
    user_id: 'user_009',
    title: 'User Research That Actually Works',
    content: 'Conducted 50 user interviews this month and discovered something surprising: users don\'t know what they want until they see it. The best insights come from observing behavior, not asking questions.',
    type: 'reflection',
    tags: ['product', 'research', 'ux'],
    likes_count: 145,
    comments_count: 38,
    shares_count: 29
  },
  {
    id: 'post_010',
    user_id: 'user_010',
    title: 'TypeScript Tips I Wish I Knew Earlier',
    content: 'Been using TypeScript for 3 years and still learning new tricks. Recently discovered utility types like Pick, Omit, and Partial - they\'ve completely changed how I type my React components!',
    type: 'reflection',
    tags: ['typescript', 'react', 'javascript'],
    likes_count: 98,
    comments_count: 26,
    shares_count: 18
  },
  {
    id: 'post_011',
    user_id: 'user_011',
    title: 'Mobile First is Not Enough',
    content: 'We\'ve been saying "mobile first" for years, but what does that really mean in 2024? It\'s not just about responsive design - it\'s about rethinking the entire user experience for touch, context, and mobile behavior patterns.',
    type: 'reflection',
    tags: ['mobile', 'design', 'ux'],
    likes_count: 123,
    comments_count: 31,
    shares_count: 24
  },
  {
    id: 'post_012',
    user_id: 'user_012',
    title: 'Web3: Beyond the Hype',
    content: 'Everyone\'s talking about blockchain, but what are the real use cases? Been experimenting with smart contracts for digital identity - that\'s where I see the real potential, not just speculative tokens.',
    type: 'reflection',
    tags: ['blockchain', 'web3', 'technology'],
    likes_count: 156,
    comments_count: 42,
    shares_count: 33
  },
  {
    id: 'post_013',
    user_id: 'user_013',
    title: 'Technical Writing That People Actually Read',
    content: 'The secret to good documentation? Write like you\'re explaining to a friend. Use simple language, practical examples, and answer the "why" before the "how". Your users will thank you.',
    type: 'reflection',
    tags: ['writing', 'documentation', 'communication'],
    likes_count: 89,
    comments_count: 22,
    shares_count: 17
  },
  {
    id: 'post_014',
    user_id: 'user_014',
    title: 'Game Development for Web Developers',
    content: 'Never thought I\'d use my web dev skills in game development, but WebGL and Three.js opened up a whole new world. The same principles of performance optimization apply, just with higher stakes!',
    type: 'reflection',
    tags: ['gamedev', 'webgl', 'creative'],
    likes_count: 134,
    comments_count: 29,
    shares_count: 25
  },
  {
    id: 'post_015',
    user_id: 'user_015',
    title: 'Marketing Automation Done Right',
    content: 'Set up an automated email sequence that increased our conversion rate by 40%. The key? Personalization at scale. Every email feels like it was written just for that user, even though it\'s automated.',
    type: 'reflection',
    tags: ['marketing', 'automation', 'email'],
    likes_count: 167,
    comments_count: 41,
    shares_count: 36
  },
  {
    id: 'post_016',
    user_id: 'user_001',
    title: 'Design Systems Save Lives',
    content: 'Our team was struggling with inconsistent designs across projects. Built a comprehensive design system and development time decreased by 60%. Consistency is the secret to scalability.',
    type: 'reflection',
    tags: ['design', 'systems', 'collaboration'],
    likes_count: 78,
    comments_count: 18,
    shares_count: 14
  },
  {
    id: 'post_017',
    user_id: 'user_002',
    title: 'The Future of Frontend Development',
    content: 'With WebAssembly, Edge Computing, and AI-assisted coding, the frontend landscape is changing fast. The developers who thrive will be the ones who never stop learning. Adapt or become obsolete.',
    type: 'reflection',
    tags: ['frontend', 'future', 'career'],
    likes_count: 234,
    comments_count: 56,
    shares_count: 47
  },
  {
    id: 'post_018',
    user_id: 'user_003',
    title: 'Creative Blocks and How to Break Them',
    content: 'Staring at a blank canvas for hours? Try this: change your environment, work with constraints, or collaborate with someone outside your field. Creativity loves constraints and hates pressure.',
    type: 'reflection',
    tags: ['creativity', 'design', 'productivity'],
    likes_count: 145,
    comments_count: 33,
    shares_count: 28
  },
  {
    id: 'post_019',
    user_id: 'user_004',
    title: 'Startup Lessons from Failures',
    content: 'My first startup failed spectacularly. Best thing that ever happened to me. Learned more from that failure than any success. Failure isn\'t the opposite of success - it\'s part of success.',
    type: 'reflection',
    tags: ['startup', 'failure', 'learning'],
    likes_count: 312,
    comments_count: 78,
    shares_count: 56
  },
  {
    id: 'post_020',
    user_id: 'user_005',
    title: 'Inclusive Design Benefits Everyone',
    content: 'Designed an app with accessibility in mind and discovered something amazing: able-bodied users loved it too. Good design is good design, period. #inclusive #a11y',
    type: 'reflection',
    tags: ['accessibility', 'design', 'inclusive'],
    likes_count: 98,
    comments_count: 24,
    shares_count: 19
  }
];

// Main seeding function
const seedStreamContent = async () => {
  try {
    console.log('📝 Starting stream content seeding...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ablegod');
    console.log('✅ Connected to MongoDB');
    
    // Clear existing posts
    console.log('🧹 Clearing existing posts...');
    await Post.deleteMany({});
    
    // Add timestamps to posts
    const postsWithTimestamps = seedPosts.map((post, index) => ({
      ...post,
      created_at: new Date(Date.now() - (index * 2 * 60 * 60 * 1000)).toISOString(), // Spread over last 40 hours
      updated_at: new Date(Date.now() - (index * 2 * 60 * 60 * 1000)).toISOString()
    }));
    
    // Insert posts
    console.log('📄 Creating posts...');
    const createdPosts = await Post.insertMany(postsWithTimestamps);
    console.log(`✅ Created ${createdPosts.length} posts`);
    
    // Display summary
    console.log('\n🎉 Stream content seeding completed successfully!');
    console.log('\n📊 Content Summary:');
    console.log(`   • Posts created: ${createdPosts.length}`);
    console.log(`   • Total likes: ${createdPosts.reduce((sum, post) => sum + post.likes_count, 0)}`);
    console.log(`   • Total comments: ${createdPosts.reduce((sum, post) => sum + post.comments_count, 0)}`);
    console.log(`   • Total shares: ${createdPosts.reduce((sum, post) => sum + post.shares_count, 0)}`);
    console.log('\n🔥 Topics covered:');
    const allTags = createdPosts.flatMap(post => post.tags);
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
