require('dotenv').config();
const mongoose = require("mongoose");
const StreamPost = require("../api/models/streamPost");
const StreamReply = require("../api/models/streamReply");
const User = require("../api/models/user");

async function migrate() {
    try {
        console.log("🌱 Starting author field migration...");
        const mongodbUri = process.env.MONGODB_URI || "mongodb://localhost:27017/ablegod";
        await mongoose.connect(mongodbUri);
        console.log("✅ Connected to MongoDB");

        // Migrate Posts
        const posts = await StreamPost.find({
            $or: [
                { author_username: { $exists: false } },
                { author_avatar_url: { $exists: false } },
                { author_username: "" },
                { author_avatar_url: "" }
            ]
        });
        console.log(`Found ${posts.length} posts to migrate`);

        let postsUpdated = 0;
        for (const post of posts) {
            const user = await User.findOne({ id: post.author_user_id });
            if (user) {
                post.author_username = String(user.username || user.email?.split("@")[0] || "");
                post.author_avatar_url = String(user.avatar_url || user.avatarUrl || "");
                await post.save();
                postsUpdated++;
            }
        }
        console.log(`✅ Updated ${postsUpdated} posts`);

        // Migrate Replies
        const replies = await StreamReply.find({
            $or: [
                { author_username: { $exists: false } },
                { author_avatar_url: { $exists: false } },
                { author_username: "" },
                { author_avatar_url: "" }
            ]
        });
        console.log(`Found ${replies.length} replies to migrate`);

        let repliesUpdated = 0;
        for (const reply of replies) {
            const user = await User.findOne({ id: reply.author_user_id });
            if (user) {
                reply.author_username = String(user.username || user.email?.split("@")[0] || "");
                reply.author_avatar_url = String(user.avatar_url || user.avatarUrl || "");
                await reply.save();
                repliesUpdated++;
            }
        }
        console.log(`✅ Updated ${repliesUpdated} replies`);

        console.log("\n🎉 Migration complete successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
}

migrate();
