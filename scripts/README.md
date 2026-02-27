# Database Seeding Guide

## 🌱 Overview

This directory contains scripts to populate your AbleGod database with realistic user data and stream content, ensuring new users encounter an engaging, populated platform instead of an empty website.

## ⚠️ **IMPORTANT SAFETY WARNINGS**

### **DANGER ZONE - Data Loss Risk**
- **`npm run seed`** - **DELETES ALL USERS** and follow relationships
- **`npm run seed:stream`** - **DELETES ALL POSTS** and content
- **These scripts will wipe your existing data including blog posts!**

### **SAFE OPTIONS**
- **Use dangerous scripts with caution** - 10-second warning period included
- **Always backup before running destructive scripts**

---

## 📁 Scripts Available

### 1. `seed-database.js` - **DANGEROUS** - Users & Follow Relationships
**⚠️ DELETES ALL EXISTING USERS AND FOLLOWS!**

Creates 15 rich user profiles with realistic data and establishes follow relationships between them.

**Features:**
- 15 diverse user profiles (designers, developers, marketers, etc.)
- Realistic avatars using DiceBear API
- Complete profiles with bios, websites, social links
- Verified badges for popular users
- Realistic follower counts (100-3000+)
- Follow relationships between users
- Password: `password123` for all test accounts

### 2. `seed-stream-content.js` - **DANGEROUS** - Stream Posts
**⚠️ DELETES ALL EXISTING POSTS!**

Creates 20 engaging stream posts covering various topics.

**Features:**
- 20 high-quality posts on tech, design, marketing, and more
- Realistic engagement metrics (likes, comments, shares)
- Diverse topics and tags
- Spread over recent timeline
- Professional, thoughtful content

---

## 🚀 Quick Start

### **For Fresh Database (DANGEROUS)**
```bash
cd ablegod-backend
npm run seed        # ⚠️ Deletes all users
npm run seed:stream # ⚠️ Deletes all posts
```

### **Step by Step (DANGEROUS)**
1. **Backup your data first!**
2. Seed users: `npm run seed`
3. Seed content: `npm run seed:stream`
4. Start backend: `npm start`

---

## 🛡️ Safety Features

### **10-Second Warning Period**
Both dangerous scripts now include a 10-second countdown:
```
⚠️  WARNING: This will DELETE ALL existing users and follow relationships!
📝 This includes all real users, blog posts, and user data!
💡 To cancel, press Ctrl+C within 10 seconds...
```

**Press Ctrl+C to save your data!**

---

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

---

## 📊 What Gets Created

### Users (15 total - DANGEROUS mode only)
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

### Stream Content (20 posts - DANGEROUS mode only)
- **Quality Content**: Thoughtful posts on various topics
- **Engagement Metrics**: Realistic likes, comments, shares
- **Topic Diversity**: Design, development, marketing, AI, etc.
- **Timeline Spread**: Posts distributed over recent hours
- **Professional Tone**: High-quality, engaging content

---

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

---

## 🔧 Customization

### Adding More Users
Edit `seed-database.js` or `seed-safe.js` and add to the users array:

```javascript
{
  id: 'user_new',
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
Edit `seed-stream-content.js` and add to the posts array:

```javascript
{
  id: 'post_new',
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

---

## 🔄 Resetting Database

### **DANGEROUS - Complete Reset**
```bash
npm run seed        # ⚠️ Deletes all users
npm run seed:stream  # ⚠️ Deletes all posts
```

---

## 🚀 Production Considerations

### **NEVER Run Dangerous Scripts in Production!**
- **`npm run seed`** will delete real users
- **`npm run seed:stream`** will delete real blog posts
- **Always backup before any seeding operations**

### **For Production Testing**
- Create production-specific seeding scripts
- Use environment variables for safety

---

## 🐛 Troubleshooting

### **Data Loss Issues**
- **Problem**: Accidentally ran dangerous script
- **Solution**: Restore from database backup
- **Prevention**: Always backup before running destructive scripts

### **Connection Issues**
- Ensure MongoDB is running
- Check `.env` file for correct connection string
- Verify network connectivity

### **Script Errors**
- Run `npm install` to ensure dependencies
- Check Node.js version compatibility
- Review error logs for specific issues

---

## 📞 Emergency Recovery

### **If You Accidentally Deleted Data**
1. **Stop the backend immediately**
2. **Restore from your most recent backup**
3. **Use only safe scripts going forward**

### **Backup Commands**
```bash
# MongoDB backup
mongodump --uri="your-mongodb-uri" --out=./backup-$(date +%Y%m%d)

# MongoDB restore
mongorestore --uri="your-mongodb-uri" ./backup-20240226
```

---

## 🎉 Best Practices

### **Development Workflow**
1. **Only use dangerous scripts** on fresh databases
2. **Backup before any seeding operations**
3. **Test with small datasets first**

### **Production Safety**
1. **Never run `npm run seed`** in production
2. **Create production-specific seeding scripts**
3. **Use environment variables for protection**
4. **Always have recent backups**

---

**Remember: Your blog posts and user data are precious! Always backup before running destructive scripts!** 🛡️
