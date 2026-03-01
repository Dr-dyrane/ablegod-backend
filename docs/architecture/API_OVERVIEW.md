# Backend API Routes Overview

> [!IMPORTANT]
> **INCOMPLETE**: The Stream section of this document is a summary only. For the full Stream API map and capability requirements, refer to the consolidated **Stream Architecture Audit**.

## Chat System Routes (`/api/chat/*`)

The AbleGod chat system provides comprehensive messaging capabilities with support for both encrypted end-to-end communication and unrestricted plain messaging.

## Route Structure

```
/api/chat/
├── identity-keys/
│   ├── GET    /           List user's identity keys
│   ├── POST   /           Register new identity key  
│   └── GET    /:userId    Get user's identity keys
├── participants/
│   └── GET    /           Search for chat participants
├── conversations/
│   ├── GET    /           List user's conversations
│   ├── POST   /           Create new conversation
│   ├── GET    /:id        Get conversation details
│   └── POST   /:id/messages Send message to conversation
└── (WebSocket Events)
    ├── chat:message:new    New message notification
    └── chat:message:updated Message update notification
```

## Authentication & Authorization

### Middleware Applied
1. **`authenticate`** - Verifies JWT token and sets `req.auth.user`
2. **`requireCapabilities`** - Enforces required permissions:
   - `chat:read` - For accessing conversations/messages
   - `chat:send` - For sending messages
   - `chat:admin` - For identity key management

### User Object Structure
```javascript
req.auth.user = {
  id: "user-uuid",
  username: "johndoe",
  email: "john@example.com", 
  role: "user",
  capabilities: ["chat:read", "chat:send", ...]
}
```

## Core Endpoints

### Media Upload Utility

#### `POST /api/upload`
**Purpose**: Generic file upload service used by blog/stream composer and later chat attachments.

- Accepts `multipart/form-data` with a single file field named `image` (current implementation handles any file type, video support considered). 
- Stores file on local disk under `public/uploads` (or `/tmp` on Vercel) and returns a public URL. 
- Guarded by `requireCapabilities("stream:create")` middleware so any user who may create a stream post can also upload media.  (Previously limited to admins/authors; guard was loosened to support ordinary members.) Future plans include connecting this endpoint to alternate storage (Postgres blob store, video pipeline, CDN proxy).
- Response: `{ url: "https://<host>/uploads/<uuid>.<ext>" }`

> **Client note**: most new media flows (user avatars, stream images) still upload directly to Cloudinary via signed presets. `/api/upload` exists as a lightweight bridge when server-side processing or non-Cloudinary storage is required, and chat attachment support is planned to reuse this pipeline.

### 1. Identity Key Management

#### `GET /api/chat/identity-keys`
**Purpose**: List all identity keys for authenticated user
**Auth**: `chat:read`
**Response**: Array of identity key objects

#### `POST /api/chat/identity-keys` 
**Purpose**: Register new device identity key
**Auth**: `chat:send` (for key registration)
**Body**: JWK public key + device metadata

#### `GET /api/chat/identity-keys/:userId`
**Purpose**: Get identity keys for specific user (conversation creation)
**Auth**: `chat:read`
**Use Case**: Fetch recipient keys during conversation creation

### 2. User Discovery

#### `GET /api/chat/participants?q=term&limit=10`
**Purpose**: Search for users to start conversations with
**Auth**: `chat:read`
**Query Params**:
- `q` - Search term (username, name, email)
- `limit` - Max results (default: 10)
**Response**: Array of user objects with `has_identity_key` flag

### Stream Search & Trending

#### `GET /api/stream/posts` (extended)
**Purpose**: Existing feed endpoint will accept additional query parameters to support keyword and tag search. Clients should be able to pass `q` (full‑text search) or `tag` (single tag) to filter results. Backend should index `metadata.tags` array and `content` field to provide fast lookups.

- **Auth**: `stream:read`
- **Future plan**: expose `/api/stream/tags/trending` returning an ordered list of hot tags/topics. Compute periodically from recent posts, with simple decay weighting (freshness + engagement). AI moderation service should vet trends to ensure spiritual context and remove offensive terms.

> _Note_: hashtags are already stored in `metadata.tags` on the post model; this section reminds developers to implement search/trend logic as part of the social core feature set.


### 3. Conversation Management

#### `GET /api/chat/conversations?limit=50`
**Purpose**: List all conversations for authenticated user
**Auth**: `chat:read`
**Response**: Conversations with `memberKeyEnvelopes` (empty for unrestricted)

#### `POST /api/chat/conversations`
**Purpose**: Create new conversation (direct or group)
**Auth**: `chat:send`
**Body**: Conversation object with members and optional key envelopes

#### `GET /api/chat/conversations/:id`
**Purpose**: Get specific conversation details
**Auth**: `chat:read`
**Middleware**: `ensureConversationMember` - Validates user is conversation member

### 4. Messaging

#### `GET /api/chat/conversations/:id/messages?limit=100&before=msgId`
**Purpose**: Paginated message retrieval
**Auth**: `chat:read`
**Middleware**: `ensureConversationMember`
**Response**: Messages with both encrypted and plain content

#### `POST /api/chat/conversations/:id/messages`
**Purpose**: Send message to conversation
**Auth**: `chat:send`
**Middleware**: `ensureConversationMember`
**Body**: Supports both formats:

**Plain Message (Unrestricted)**:
```javascript
{
  content_type: "text",
  content: "Hello world!",
  metadata: {}
}
```

**Encrypted Message (Legacy)**:
```javascript
{
  content_type: "text",
  algorithm: "AES-GCM-256",
  key_id: "msg-key-id",
  ciphertext: "base64encrypted...",
  iv: "base64iv...",
  aad: "base64aad...",
  metadata: {}
}
```

## Special Features

### Dual Message Format Support
- **Automatic Detection**: System detects plain vs encrypted messages
- **Backward Compatibility**: Existing encrypted conversations continue working
- **Performance Optimization**: Plain messages avoid encryption overhead
- **Flexible Architecture**: New unrestricted chat + legacy encrypted chat

### Real-time Communication
- **Pusher Integration**: WebSocket events for live updates
- **Room Management**: Automatic join/leave for conversation rooms
- **Event Types**: `chat:message:new`, `chat:message:updated`

### Security Controls
- **Member Validation**: `ensureConversationMember` middleware prevents unauthorized access
- **Capability Enforcement**: Route-level permission checks
- **Rate Limiting**: Message sending and conversation creation limits

## Error Handling

### Standard Response Format
```javascript
// Success
{
  success: true,
  data: { /* response data */ }
}

// Error  
{
  success: false,
  message: "Human readable error description"
}
```

### HTTP Status Codes
- `200` - OK (GET requests)
- `201` - Created (POST requests)
- `400` - Bad Request (invalid data)
- `401` - Unauthorized (invalid/missing JWT)
- `403` - Forbidden (insufficient capabilities)
- `404` - Not Found (conversation doesn't exist)
- `500` - Internal Server Error

## Performance Optimizations

### Database Indexes
- `ChatMessage`: `{ conversation_id: 1, created_at: -1 }`
- `ChatConversation`: `{ memberIds: 1, updated_at: -1 }`
- `ChatIdentityKey`: `{ user_id: 1, key_id: 1 }`

### Caching Strategy
- **Conversation Lists**: In-memory cache for active conversations
- **User Search**: Cached participant search results
- **Identity Keys**: Session-based key caching

### Rate Limits
- **Messages**: 10/minute per user
- **Conversations**: 5/hour per user  
- **Search**: 20/minute per user

## Testing

### E2E Test Coverage
See `tests/e2e/endpoints.e2e.test.js` for comprehensive endpoint testing including:
- Authentication flows
- Message sending (both formats)
- Conversation creation
- Permission validation
- Error scenarios

## WebSocket Integration

### Pusher Channels
- **User Channels**: `chat-user-{userId}` - Private notifications
- **Conversation Channels**: `chat-conversation-{conversationId}` - Message updates

### Event Payloads
```javascript
// New message event
{
  conversation_id: "conv-uuid",
  message: {
    id: "msg-uuid",
    sender_id: "user-uuid", 
    content_type: "text",
    content: "Plain text message", // Unrestricted
    created_at: "2024-01-01T00:00:00Z"
  }
}
```

This route design enables seamless chat functionality with both security models while maintaining high performance and scalability.

---

## Stream System Routes (`/api/stream/*`)

The AbleGod Stream platform enables social engagement through reflections, comments, and community interactions.

### Route Structure

```
/api/stream/
├── posts/
│   ├── GET    /           List feed posts (explore/following/bookmarks)
│   ├── POST   /           Create new stream post
│   ├── GET    /:id        Get post details & replies
│   ├── PUT    /:id/reaction Toggle post reaction
│   ├── POST   /:id/bookmark Toggle post bookmark
│   ├── POST   /:id/restream Toggle post restream
│   ├── POST   /:id/share    Increment share count
│   ├── POST   /:id/view     Increment view count
│   └── replies/
│       ├── POST   /       Create reply to post
│       └── :replyId/reaction Toggle reply reaction
└── admin/
    ├── reports/  GET      Get moderation queue
    ├── posts/:id/moderation PATCH Moderate post
    ├── posts/:id/feature    PATCH Feature post
    └── replies/:replyId/moderation PATCH Moderate reply
```

### Authentication & Authorization

- **`stream:read` / `feed:read`**: Required for GET routes.
- **`stream:create`**: Required for creating posts.
- **`stream:reply` / `post:interact`**: Required for engagement actions (replies, reactions, bookmarks).
- **`stream:moderate`**: Required for admin/moderation routes.

---

## Summary

This comprehensive API design enables seamless communication and social interaction across the AbleGod platform while maintaining security, scalability, and high performance.
