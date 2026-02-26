# Database Seeding Guide

## 🌱 Overview

This directory contains scripts to populate your AbleGod database with realistic user data and stream content, ensuring new users encounter an engaging, populated platform instead of an empty website.

## 📁 Scripts Available

### 1. `seed-database.js` - Users & Follow Relationships
Creates 15 rich user profiles with realistic data and establishes follow relationships between them.

**Features:**
- 15 diverse user profiles (designers, developers, marketers, etc.)
- Realistic avatars using DiceBear API
- Complete profiles with bios, websites, social links
- Verified badges for popular users
- Realistic follower counts (100-3000+)
- Follow relationships between users
- Password: `password123` for all test accounts

### 2. `seed-stream-content.js` - Stream Posts
Creates 20 engaging stream posts covering various topics.

**Features:**
- 20 high-quality posts on tech, design, marketing, and more
- Realistic engagement metrics (likes, comments, shares)
- Diverse topics and tags
- Spread over recent timeline
- Professional, thoughtful content

## 🚀 Quick Start

### Prerequisites
- MongoDB running locally or connection string in `.env`
- Node.js installed
- Backend dependencies installed (`npm install`)

### Step 1: Seed Users
```bash
cd ablegod-backend
npm run seed
```

### Step 2: Seed Stream Content
```bash
npm run seed:stream
```

### Step 3: Start Backend
```bash
npm start
```

### Step 4: Test Frontend
Navigate to `http://localhost:8080` and enjoy the populated platform!

## 👥 Test Accounts

All seeded accounts use the same password for easy testing:

| Email | Password | Role | Verified |
|-------|----------|------|----------|
| sarah.chen@example.com | password123 | user | ✅ |
| mike.johnson@example.com | password123 | user | ✅ |
| emily.rodriguez@example.com | password123 | user | ✅ |
| alexthompson@example.com | password123 | user | ✅ |
| jessica.wang@example.com | password123 | user | ❌ |

*And 10 more users with similar credentials*

## 📊 What Gets Created

### Users (15 total)
- **Diverse Roles**: Product designers, developers, marketers, artists, etc.
- **Realistic Profiles**: Complete bios, websites, social media links
- **Avatar Images**: Unique avatars for each user
- **Verification Status**: Popular users have verified badges
- **Follower Counts**: Realistic numbers (100-3000+ followers)

### Follow Relationships
- **Natural Patterns**: Each user follows 5-12 other users
- **Random Distribution**: Realistic follow graph
- **Timestamps**: Relationships created over last 90 days
- **Bidirectional**: Some mutual follows for realism

### Stream Content (20 posts)
- **Quality Content**: Thoughtful posts on various topics
- **Engagement Metrics**: Realistic likes, comments, shares
- **Topic Diversity**: Design, development, marketing, AI, etc.
- **Timeline Spread**: Posts distributed over recent hours
- **Professional Tone**: High-quality, engaging content

## 🎯 Topics Covered

### Technology
- React, TypeScript, JavaScript
- AI/ML, Web3, Blockchain
- DevOps, Infrastructure
- Mobile Development

### Design & UX
- UI/UX Design principles
- Accessibility, Inclusive design
- Design Systems
- Creative inspiration

### Business & Marketing
- Startups, Product management
- Content marketing
- Marketing automation
- User research

### Personal Development
- Career growth
- Learning strategies
- Creative blocks
- Failure and success

## 🔧 Customization

### Adding More Users
Edit `seed-database.js` and add to the `seedUsers` array:

```javascript
{
  id: 'user_016',
  username: 'newuser',
  first_name: 'New',
  last_name: 'User',
  email: 'new.user@example.com',
  role: 'user',
  status: 'active',
  avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=newuser',
  bio: 'Your bio here',
  // ... other fields
}
```

### Adding More Content
Edit `seed-stream-content.js` and add to the `seedPosts` array:

```javascript
{
  id: 'post_021',
  user_id: 'user_001',
  title: 'Your Post Title',
  content: 'Your post content...',
  type: 'reflection',
  tags: ['tag1', 'tag2'],
  likes_count: 50,
  comments_count: 10,
  shares_count: 5
}
```

### Adjusting Follower Counts
Modify the `followers_count` and `following_count` in user objects to simulate different popularity levels.

## 🔄 Resetting Database

To clear all seeded data and start fresh:

```bash
# Clear users and follows
npm run seed

# Clear stream content
npm run seed:stream
```

Or manually connect to MongoDB and drop collections:
```javascript
await User.deleteMany({});
await Follow.deleteMany({});
await Post.deleteMany({});
```

## 🚀 Production Considerations

### Security
- Change default passwords before production
- Use environment variables for sensitive data
- Implement proper authentication

### Performance
- Consider indexing for large datasets
- Implement pagination for content feeds
- Cache frequently accessed data

### Maintenance
- Regular content updates
- User activity simulation
- Engagement metric updates

## 🎉 Expected Results

After running both seed scripts, new users will see:

1. **Rich User Profiles**: 15 realistic users to follow and interact with
2. **Engaging Content**: 20 high-quality posts in their stream
3. **Active Community**: Users with followers, following relationships
4. **Professional Experience**: Polished, populated platform
5. **Immediate Engagement**: No empty state or "be the first to post"

## 🐛 Troubleshooting

### Connection Issues
- Ensure MongoDB is running
- Check `.env` file for correct connection string
- Verify network connectivity

### Script Errors
- Run `npm install` to ensure dependencies
- Check Node.js version compatibility
- Review error logs for specific issues

### Missing Data
- Verify scripts completed successfully
- Check MongoDB collections directly
- Re-run scripts if needed

## 📞 Support

For issues with the seeding scripts:
1. Check this README first
2. Review console output for error messages
3. Verify MongoDB connection and permissions
4. Check that all dependencies are installed

---

**Happy seeding! 🌱**
