// scripts/seed-database.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../api/models/user');
const Follow = require('../api/models/follow');

// Rich user data with diverse profiles
const seedUsers = [
  {
    id: 'user_001',
    username: 'sarahchen',
    first_name: 'Sarah',
    last_name: 'Chen',
    email: 'sarah.chen@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarahchen',
    bio: 'Product designer passionate about creating intuitive user experiences. Love coffee, hiking, and minimalist design.',
    website: 'https://sarahchen.design',
    twitter: '@sarahchen',
    linkedin: 'sarah-chen',
    followers_count: 342,
    following_count: 128,
    verified: true,
    post_count: 47
  },
  {
    id: 'user_002',
    username: 'mikejohnson',
    first_name: 'Mike',
    last_name: 'Johnson',
    email: 'mike.johnson@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mikejohnson',
    bio: 'Full-stack developer | React enthusiast | Open source contributor. Building the future one line of code at a time.',
    website: 'https://mikejohnson.dev',
    twitter: '@mikejohnson',
    linkedin: 'mike-johnson',
    followers_count: 891,
    following_count: 234,
    verified: true,
    post_count: 156
  },
  {
    id: 'user_003',
    username: 'emilyrodriguez',
    first_name: 'Emily',
    last_name: 'Rodriguez',
    email: 'emily.rodriguez@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emilyrodriguez',
    bio: 'Digital artist and creative director. Specializing in brand identity and motion graphics. 🎨✨',
    website: 'https://emilyrodriguez.art',
    twitter: '@emilyrodriguez',
    linkedin: 'emily-rodriguez',
    followers_count: 1256,
    following_count: 89,
    verified: true,
    post_count: 234
  },
  {
    id: 'user_004',
    username: 'alexthompson',
    first_name: 'Alex',
    last_name: 'Thompson',
    email: 'alex.thompson@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alexthompson',
    bio: 'Startup founder building AI tools for creators. Previously at Google and Meta. Coffee addict ☕',
    website: 'https://alexthompson.ai',
    twitter: '@alexthompson',
    linkedin: 'alex-thompson',
    followers_count: 3421,
    following_count: 167,
    verified: true,
    post_count: 89
  },
  {
    id: 'user_005',
    username: 'jessicawang',
    first_name: 'Jessica',
    last_name: 'Wang',
    email: 'jessica.wang@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jessicawang',
    bio: 'UX researcher focused on accessibility and inclusive design. Making the web better for everyone. 🌍',
    website: 'https://jessicawang.ux',
    twitter: '@jessicawang',
    linkedin: 'jessica-wang',
    followers_count: 567,
    following_count: 198,
    verified: false,
    post_count: 67
  },
  {
    id: 'user_006',
    username: 'davidkim',
    first_name: 'David',
    last_name: 'Kim',
    email: 'david.kim@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=davidkim',
    bio: 'Data scientist and ML engineer. Passionate about NLP and computer vision. Python 🐍 enthusiast.',
    website: 'https://davidkim.ml',
    twitter: '@davidkim',
    linkedin: 'david-kim',
    followers_count: 892,
    following_count: 312,
    verified: true,
    post_count: 145
  },
  {
    id: 'user_007',
    username: 'lisamartinez',
    first_name: 'Lisa',
    last_name: 'Martinez',
    email: 'lisa.martinez@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=lisamartinez',
    bio: 'Content creator and marketing strategist. Helping brands tell their stories. 📱✍️',
    website: 'https://lisamartinez.media',
    twitter: '@lisamartinez',
    linkedin: 'lisa-martinez',
    followers_count: 2341,
    following_count: 456,
    verified: true,
    post_count: 378
  },
  {
    id: 'user_008',
    username: 'ryanobrien',
    first_name: 'Ryan',
    last_name: 'O\'Brien',
    email: 'ryan.obrien@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ryanobrien',
    bio: 'DevOps engineer automating everything. Kubernetes enthusiast. Linux lover. 🐧',
    website: 'https://ryanobrien.dev',
    twitter: '@ryanobrien',
    linkedin: 'ryan-obrien',
    followers_count: 445,
    following_count: 234,
    verified: false,
    post_count: 89
  },
  {
    id: 'user_009',
    username: 'natashapatel',
    first_name: 'Natasha',
    last_name: 'Patel',
    email: 'natasha.patel@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=natashapatel',
    bio: 'Product manager with a background in engineering. Building products that users love. 🚀',
    website: 'https://natashapatel.pm',
    twitter: '@natashapatel',
    linkedin: 'natasha-patel',
    followers_count: 1567,
    following_count: 289,
    verified: true,
    post_count: 234
  },
  {
    id: 'user_010',
    username: 'chriswilson',
    first_name: 'Chris',
    last_name: 'Wilson',
    email: 'chris.wilson@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=chriswilson',
    bio: 'Frontend developer specializing in React and TypeScript. Creating beautiful, performant web apps. ⚡',
    website: 'https://chriswilson.dev',
    twitter: '@chriswilson',
    linkedin: 'chris-wilson',
    followers_count: 789,
    following_count: 345,
    verified: false,
    post_count: 123
  },
  {
    id: 'user_011',
    username: 'amandaling',
    first_name: 'Amanda',
    last_name: 'Ling',
    email: 'amanda.ling@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=amandaling',
    bio: 'Mobile app developer (iOS/Android). Building apps that make a difference. 📱💙',
    website: 'https://amandaling.mobile',
    twitter: '@amandaling',
    linkedin: 'amanda-ling',
    followers_count: 623,
    following_count: 178,
    verified: false,
    post_count: 89
  },
  {
    id: 'user_012',
    username: 'kevinbrown',
    first_name: 'Kevin',
    last_name: 'Brown',
    email: 'kevin.brown@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=kevinbrown',
    bio: 'Blockchain developer and Web3 enthusiast. Building the decentralized future. 🔗',
    website: 'https://kevinbrown.crypto',
    twitter: '@kevinbrown',
    linkedin: 'kevin-brown',
    followers_count: 1123,
    following_count: 267,
    verified: true,
    post_count: 167
  },
  {
    id: 'user_013',
    username: 'sophiagarcia',
    first_name: 'Sophia',
    last_name: 'Garcia',
    email: 'sophia.garcia@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sophiagarcia',
    bio: 'Technical writer and documentation specialist. Making complex topics simple to understand. 📚✍️',
    website: 'https://sophiagarcia.tech',
    twitter: '@sophiagarcia',
    linkedin: 'sophia-garcia',
    followers_count: 445,
    following_count: 123,
    verified: false,
    post_count: 234
  },
  {
    id: 'user_014',
    username: 'jamestaylor',
    first_name: 'James',
    last_name: 'Taylor',
    email: 'james.taylor@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jamestaylor',
    bio: 'Game developer and creative coder. Making interactive experiences. 🎮🎨',
    website: 'https://jamestaylor.games',
    twitter: '@jamestaylor',
    linkedin: 'james-taylor',
    followers_count: 890,
    following_count: 234,
    verified: true,
    post_count: 145
  },
  {
    id: 'user_015',
    username: 'michellelee',
    first_name: 'Michelle',
    last_name: 'Lee',
    email: 'michelle.lee@example.com',
    role: 'user',
    status: 'active',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=michellelee',
    bio: 'Marketing automation specialist. Helping businesses scale with smart workflows. 📊🤖',
    website: 'https://michellelee.marketing',
    twitter: '@michellelee',
    linkedin: 'michelle-lee',
    followers_count: 567,
    following_count: 189,
    verified: false,
    post_count: 98
  }
];

// Create follow relationships between users
const createFollowRelationships = async (users) => {
  const followRelationships = [];
  
  // Create realistic follow patterns
  for (let i = 0; i < users.length; i++) {
    const follower = users[i];
    
    // Each user follows 5-12 other users (realistic pattern)
    const followCount = Math.floor(Math.random() * 8) + 5;
    const usersToFollow = [];
    
    // Select random users to follow (excluding self)
    const availableUsers = users.filter(u => u._id.toString() !== follower._id.toString());
    
    for (let j = 0; j < followCount && j < availableUsers.length; j++) {
      const randomIndex = Math.floor(Math.random() * availableUsers.length);
      const userToFollow = availableUsers[randomIndex];
      
      if (!usersToFollow.includes(userToFollow._id.toString())) {
        usersToFollow.push(userToFollow._id.toString());
        
        followRelationships.push({
          follower_id: follower._id, // Use MongoDB ObjectId
          following_id: userToFollow._id, // Use MongoDB ObjectId
          created_at: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString() // Random time in last 90 days
        });
      }
    }
  }
  
  return followRelationships;
};

// Main seeding function
const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ablegod');
    console.log('✅ Connected to MongoDB');
    
    // Clear existing data - WARNING: This will delete ALL users and follows!
    console.log('\n⚠️  WARNING: This will DELETE ALL existing users and follow relationships!');
    console.log('📝 This includes all real users, blog posts, and user data!');
    console.log('💡 To cancel, press Ctrl+C within 10 seconds...');
    
    // Wait 10 seconds to allow cancellation
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('🧹 Proceeding with data clearance...');
    await User.deleteMany({});
    await Follow.deleteMany({});
    console.log('✅ Cleared all existing users and follows');
    
    // Hash passwords for all users
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Add password to all users
    const usersWithPasswords = seedUsers.map(user => ({
      ...user,
      password: hashedPassword,
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(), // Random time in last year
      lastLogin: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() // Random time in last 30 days
    }));
    
    // Insert users
    console.log('👥 Creating users...');
    const createdUsers = await User.insertMany(usersWithPasswords);
    console.log(`✅ Created ${createdUsers.length} users`);
    
    // Create follow relationships
    console.log('🤝 Creating follow relationships...');
    const followRelationships = await createFollowRelationships(createdUsers);
    await Follow.insertMany(followRelationships);
    console.log(`✅ Created ${followRelationships.length} follow relationships`);
    
    // Update follower/following counts
    console.log('📊 Updating follower counts...');
    for (const user of createdUsers) {
      const followersCount = await Follow.countDocuments({ following_id: user._id });
      const followingCount = await Follow.countDocuments({ follower_id: user._id });
      
      await User.updateOne(
        { _id: user._id },
        { 
          followers_count: followersCount,
          following_count: followingCount
        }
      );
    }
    console.log('✅ Updated follower counts');
    
    // Display summary
    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📈 Summary:');
    console.log(`   • Users created: ${createdUsers.length}`);
    console.log(`   • Follow relationships: ${followRelationships.length}`);
    console.log('\n🔑 Test Accounts:');
    console.log('   • Email: sarah.chen@example.com | Password: password123');
    console.log('   • Email: mike.johnson@example.com | Password: password123');
    console.log('   • Email: emily.rodriguez@example.com | Password: password123');
    console.log('\n💡 All users use password: password123');
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the seeder
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, seedUsers };
