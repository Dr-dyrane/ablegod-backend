const mongoose = require("mongoose");
const StreamPost = require("./api/models/streamPost");
const StreamReply = require("./api/models/streamReply");
const User = require("./api/models/user");

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/ablegod");
        console.log("Connected to MongoDB");

        const posts = await StreamPost.find({ author_username: { $exists: false } });
        console.log(`Found ${posts.length} posts to migrate`);

        for (const post of posts) {
            const user = await User.findOne({ id: post.author_user_id });
            if (user) {
                post.author_username = user.username || user.email?.split("@")[0] || "";
                post.author_avatar_url = user.avatar_url || user.avatarUrl || "";
                await post.save();
                console.log(`Updated post ${post.id}`);
            }
        }

        const replies = await StreamReply.find({ author_username: { $exists: false } });
        console.log(`Found ${replies.length} replies to migrate`);

        for (const reply of replies) {
            const user = await User.findOne({ id: reply.author_user_id });
            if (user) {
                reply.author_username = user.username || user.email?.split("@")[0] || "";
                reply.author_avatar_url = user.avatar_url || user.avatarUrl || "";
                await reply.save();
                console.log(`Updated reply ${reply.id}`);
            }
        }

        console.log("Migration complete");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
}

migrate();
