# MongoDB Schemas for AbleGod Chat System

## Overview

This document outlines the MongoDB schemas used by the AbleGod chat system, supporting both encrypted end-to-end messaging and unrestricted plain messaging.

## ChatMessage Schema

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

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | Yes | Unique message identifier (UUID) |
| `conversation_id` | String | Yes | Reference to parent conversation |
| `sender_id` | String | Yes | User who sent the message |
| `content_type` | String | No | Message type (default: "text") |
| `algorithm` | String | No | Encryption algorithm used |
| `key_id` | String | No | Message encryption key identifier |
| `ciphertext` | String | No | **Encrypted content** (base64) |
| `iv` | String | No | **Initialization vector** (base64) |
| `aad` | String | No | **Additional authenticated data** (base64) |
| `content` | String | No | **Plain text content** (unrestricted) |
| `metadata` | Mixed | No | Additional message metadata |
| `created_at` | String | No | Message creation timestamp |
| `edited_at` | String | No | Last edit timestamp |
| `deleted_at` | String | No | Soft delete timestamp |

### Message Format Variants

#### Encrypted Message (Legacy)
```javascript
{
  id: "msg-uuid",
  conversation_id: "conv-uuid",
  sender_id: "user-uuid",
  content_type: "text",
  algorithm: "AES-GCM-256",
  key_id: "key-uuid",
  ciphertext: "base64encrypteddata...",
  iv: "base64iv...",
  aad: "base64aad...",
  metadata: {},
  created_at: "2024-01-01T00:00:00Z"
}
```

#### Plain Message (Unrestricted)
```javascript
{
  id: "msg-uuid",
  conversation_id: "conv-uuid", 
  sender_id: "user-uuid",
  content_type: "text",
  algorithm: "AES-GCM-256",
  key_id: "",
  ciphertext: "", // Empty
  iv: "", // Empty
  aad: "",
  content: "Hello world!", // Plain text
  metadata: {},
  created_at: "2024-01-01T00:00:00Z"
}
```

## ChatConversation Schema

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

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | Yes | Unique conversation identifier (UUID) |
| `type` | String | Yes | Conversation type: "direct" or "group" |
| `name` | String | No | Display name for the conversation |
| `memberIds` | [String] | Yes | Array of user IDs in conversation |
| `memberKeyEnvelopes` | [Mixed] | No | **Encryption envelopes** (empty for unrestricted) |
| `created_at` | String | No | Conversation creation timestamp |
| `updated_at` | String | No | Last update timestamp |
| `last_message_meta` | Object | No | Reference to most recent message |

### Conversation Types

#### Direct Conversation
```javascript
{
  id: "conv-uuid",
  type: "direct",
  name: "John Doe",
  memberIds: ["user-1", "user-2"],
  memberKeyEnvelopes: [], // Empty for unrestricted chat
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z"
}
```

#### Group Conversation
```javascript
{
  id: "conv-uuid",
  type: "group", 
  name: "Project Team",
  memberIds: ["user-1", "user-2", "user-3"],
  memberKeyEnvelopes: [
    {
      user_id: "user-1",
      key_id: "key-uuid",
      algorithm: "AES-GCM-256",
      encrypted_key: "base64encrypted...",
      iv: "base64iv...",
      conversation_key_id: "conv-key-uuid"
    }
    // ... more envelopes for each member
  ],
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z"
}
```

## ChatIdentityKey Schema

```javascript
const chatIdentityKeySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  user_id: { type: String, required: true, index: true },
  key_id: { type: String, required: true, index: true },
  algorithm: { type: String, required: true },
  public_key_jwk: { type: mongoose.Schema.Types.Mixed, required: true },
  device_label: { type: String, required: true },
  status: { type: String, required: true, enum: ["active", "inactive", "revoked"] },
  created_at: { type: String, default: () => new Date().toISOString(), index: true },
  updated_at: { type: String, default: () => new Date().toISOString(), index: true },
  last_seen_at: { type: String, required: false, index: true },
});
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | Yes | Unique key identifier |
| `user_id` | String | Yes | Owner of the identity key |
| `key_id` | String | Yes | Key identifier for cryptographic operations |
| `algorithm` | String | Yes | Encryption algorithm (e.g., "ECDH-P256") |
| `public_key_jwk` | Mixed | Yes | **Public key** in JWK format |
| `device_label` | String | Yes | Human-readable device identifier |
| `status` | String | Yes | Key status: "active", "inactive", "revoked" |
| `created_at` | String | No | Key creation timestamp |
| `updated_at` | String | No | Last update timestamp |
| `last_seen_at` | String | No | When key was last used |

### Identity Key Format

```javascript
{
  id: "key-uuid",
  user_id: "user-uuid",
  key_id: "device-iphone15pro",
  algorithm: "ECDH-P256",
  public_key_jwk: {
    kty: "EC",
    crv: "P-256",
    x: "...",
    y: "...",
    kid: "device-iphone15pro"
  },
  device_label: "iPhone 15 Pro",
  status: "active",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z"
}
```

## Indexes

### Optimized Queries

The following indexes ensure optimal performance:

#### ChatMessage Indexes
- `{ conversation_id: 1, created_at: -1 }` - Fast conversation message retrieval
- `{ sender_id: 1, created_at: -1 }` - User message history
- `{ created_at: -1 }` - Global message timeline

#### ChatConversation Indexes  
- `{ memberIds: 1, updated_at: -1 }` - User's conversations
- `{ created_at: -1, updated_at: -1 }` - Conversation timeline
- `{ type: 1, updated_at: -1 }` - Conversation type filtering

#### ChatIdentityKey Indexes
- `{ user_id: 1, status: 1 }` - User's active keys
- `{ key_id: 1, algorithm: 1 }` - Key lookup operations
- `{ created_at: -1, updated_at: -1 }` - Key management timeline

## Data Relationships

### Message Flow
1. **Conversation** → contains many **Messages**
2. **User** → has many **Identity Keys**  
3. **Conversation** → has many **Key Envelopes** (for encrypted chats)
4. **Message** → belongs to one **Conversation**

### Unrestricted vs Encrypted Chat

| Aspect | Encrypted Chat | Unrestricted Chat |
|---------|----------------|-------------------|
| **Message Storage** | `ciphertext`, `iv`, `aad` | `content` (plain text) |
| **Key Requirements** | Identity keys required | No key requirements |
| **Performance** | Encryption overhead | Direct storage |
| **Security** | End-to-end encrypted | Server-accessible |
| **Compatibility** | Legacy system | New flexible system |

## Migration Strategy

### Phase 1: Dual Support
- Both encrypted and unrestricted messages coexist
- Existing encrypted conversations unchanged
- New conversations default to unrestricted mode

### Phase 2: Gradual Migration (Optional)
- Migrate high-value conversations to unrestricted
- Maintain encryption for sensitive conversations
- User preference for encryption level

### Phase 3: Unified System
- Single flexible message format
- User-controlled encryption preferences
- Backward compatibility maintained

This schema design ensures the AbleGod chat system can scale efficiently while supporting both security models.
