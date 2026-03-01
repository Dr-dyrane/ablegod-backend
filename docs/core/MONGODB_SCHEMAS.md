# MongoDB Schemas for AbleGod System

## Overview

This document outlines the MongoDB schemas used by the AbleGod platform, covering the Chat System and the Stream Social Platform.

---

## Chat System Schemas

### ChatMessage Schema

```javascript
const chatMessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  conversation_id: { type: String, required: true, index: true },
  sender_id: { type: String, required: true, index: true },
  content_type: { type: String, default: "text" },
  algorithm: { type: String, default: "AES-GCM-256" },
  key_id: { type: String, default: "" },
  ciphertext: { type: String, required: false }, // base64 - optional for plain messages
  iv: { type: String, required: false }, // base64 - optional for plain messages
  aad: { type: String, default: "" }, // optional base64 encoded associated data
  content: { type: String, required: false }, // Plain text content for unrestricted chat
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  created_at: { type: String, default: () => new Date().toISOString(), index: true },
  edited_at: { type: String, default: null },
  deleted_at: { type: String, default: null },
});
```

### ChatConversation Schema

```javascript
const chatConversationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  type: { type: String, required: true, enum: ["direct", "group"] },
  name: { type: String, required: false },
  memberIds: { type: [String], required: true, index: true },
  memberKeyEnvelopes: { type: [mongoose.Schema.Types.Mixed], required: false, default: [] },
  created_at: { type: String, default: () => new Date().toISOString(), index: true },
  updated_at: { type: String, default: () => new Date().toISOString(), index: true },
  last_message_meta: {
    sender_id: { type: String, required: false },
    message_id: { type: String, required: false },
    content_type: { type: String, required: false },
    created_at: { type: String, required: false },
  },
});
```

---

## Stream Social Schemas

### StreamPost Schema

```javascript
const streamPostSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  author_user_id: { type: String, required: true, index: true },
  author_name: { type: String },
  author_role: { type: String, default: "user" },
  intent: { type: String, default: "Reflection" },
  title: { type: String },
  content: { type: String },
  excerpt: { type: String },
  image_url: { type: String },
  status: { type: String, enum: ["published", "draft", "blocked"], default: "published" },
  reply_count: { type: Number, default: 0 },
  like_count: { type: Number, default: 0 },
  bookmark_count: { type: Number, default: 0 },
  restream_count: { type: Number, default: 0 },
  share_count: { type: Number, default: 0 },
  view_count: { type: Number, default: 0 },
  reaction_counts: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  created_at: { type: String, default: () => new Date().toISOString(), index: true },
  updated_at: { type: String, default: () => new Date().toISOString() },
});
```

### StreamReply Schema

```javascript
const streamReplySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  post_id: { type: String, required: true, index: true },
  parent_reply_id: { type: String, default: null, index: true },
  author_user_id: { type: String, required: true, index: true },
  author_name: { type: String },
  author_role: { type: String, default: "user" },
  content: { type: String, required: true },
  status: { type: String, enum: ["published", "blocked"], default: "published" },
  like_count: { type: Number, default: 0 },
  reaction_counts: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  created_at: { type: String, default: () => new Date().toISOString(), index: true },
  updated_at: { type: String, default: () => new Date().toISOString() },
});
```

### StreamInteraction Schemas

```javascript
// StreamBookmark & StreamRestream Schema
{
  id: { type: String, required: true, unique: true },
  post_id: { type: String, required: true, index: true },
  user_id: { type: String, required: true, index: true },
  created_at: { type: String, default: () => new Date().toISOString() }
}

// StreamReaction Schema
{
  id: { type: String, required: true, unique: true },
  target_type: { type: String, enum: ["post", "reply"], required: true },
  target_id: { type: String, required: true, index: true },
  user_id: { type: String, required: true, index: true },
  reaction_type: { type: String, enum: ["like", "amen", "pray"], required: true },
  created_at: { type: String, default: () => new Date().toISOString() }
}
```

---

## Data Relationships

### Message Flow
1. **Conversation** → contains many **Messages**
2. **User** → has many **Identity Keys**  
3. **Conversation** → has many **Key Envelopes** (for encrypted chats)

### Stream Flow
1. **StreamPost** → has many **StreamReplies**
2. **StreamPost** → has many **StreamReactions**
3. **User** → **StreamBookmarks** / **StreamRestreams** (Many-to-Many join)
4. **User** → **StreamFollows** (Self-referential Many-to-Many)
