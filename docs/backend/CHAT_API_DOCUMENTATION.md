# AbleGod Backend Chat API Documentation

## Overview

The AbleGod backend provides a comprehensive chat system with support for both encrypted end-to-end messaging and unrestricted plain messaging. The system is designed to handle seamless communication between all users without artificial constraints.

## Authentication

All chat endpoints require authentication with the following capabilities:
- `chat:read` - Required for accessing conversations and messages
- `chat:send` - Required for sending messages

## Core Concepts

### Message Types

The system supports two message formats:

#### 1. Encrypted Messages (Legacy)
- End-to-end encrypted using ECDH-P256 + AES-GCM-256
- Requires identity keys for both participants
- Stored with `ciphertext`, `iv`, `algorithm` fields
- Backward compatible with existing encrypted conversations

#### 2. Plain Messages (Unrestricted)
- Direct plain text content without encryption overhead
- No identity key requirements
- Stored with `content` field
- Immediate accessibility on all devices

### Conversation Types

- **Direct Messages** - 1-on-1 conversations between two users
- **Group Messages** - Multi-user conversations (future enhancement)

## API Endpoints

### Identity Management

#### `GET /api/chat/identity-keys`
List identity keys for the authenticated user.

**Response:**
```json
{
  "success": true,
  "keys": [
    {
      "id": "key-id",
      "user_id": "user-id", 
      "key_id": "device-key-id",
      "algorithm": "ECDH-P256",
      "public_key_jwk": {...},
      "device_label": "Primary device",
      "status": "active",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### `POST /api/chat/identity-keys`
Register a new identity key for the authenticated user.

**Request:**
```json
{
  "keyId": "device-uuid",
  "algorithm": "ECDH-P256", 
  "publicKeyJwk": {...},
  "deviceLabel": "iPhone 15 Pro"
}
```

#### `GET /api/chat/identity-keys/:userId`
Get identity keys for a specific user (used for conversation creation).

### User Discovery

#### `GET /api/chat/participants`
Search for users available to chat with.

**Query Parameters:**
- `q` - Search query string
- `limit` - Maximum results (default: 10)

**Response:**
```json
{
  "success": true,
  "participants": [
    {
      "id": "user-id",
      "username": "johndoe", 
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "status": "active",
      "avatar_url": "https://...",
      "has_identity_key": true
    }
  ]
}
```

### Conversations

#### `GET /api/chat/conversations`
List all conversations for the authenticated user.

**Query Parameters:**
- `limit` - Maximum conversations to return (default: 50)

**Response:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "conv-id",
      "type": "direct",
      "name": "John Doe",
      "memberIds": ["user-1", "user-2"],
      "memberKeyEnvelopes": [...],
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "last_message_meta": {
        "sender_id": "user-1",
        "message_id": "msg-id",
        "content_type": "text",
        "created_at": "2024-01-01T00:00:00Z"
      }
    }
  ]
}
```

#### `POST /api/chat/conversations`
Create a new conversation.

**Request (Direct):**
```json
{
  "type": "direct",
  "name": "John Doe",
  "memberIds": ["user-2-id"],
  "memberKeyEnvelopes": [] // Empty for unrestricted chat
}
```

**Request (Group):**
```json
{
  "type": "group", 
  "name": "Project Team",
  "memberIds": ["user-2-id", "user-3-id", "user-4-id"],
  "memberKeyEnvelopes": [
    {
      "user_id": "creator-id",
      "key_id": "key-id",
      "algorithm": "AES-GCM-256",
      "encrypted_key": "base64encrypted...",
      "iv": "base64iv...",
      "sender_key_id": "sender-key-id",
      "recipient_key_id": "recipient-key-id",
      "conversation_key_id": "conv-key-id"
    }
  ]
}
```

#### `GET /api/chat/conversations/:conversationId`
Get details for a specific conversation.

### Messages

#### `GET /api/chat/conversations/:conversationId/messages`
List messages in a conversation.

**Query Parameters:**
- `limit` - Maximum messages to return (default: 100)
- `before` - Get messages before this message ID (for pagination)

**Response:**
```json
{
  "success": true,
  "conversation": {...},
  "messages": [
    {
      "id": "msg-id",
      "conversation_id": "conv-id",
      "sender_id": "user-id",
      "content_type": "text",
      "algorithm": "AES-GCM-256",
      "key_id": "",
      "ciphertext": "base64encrypted...", // Empty for plain messages
      "iv": "base64iv...", // Empty for plain messages  
      "content": "Plain text message", // Only for unrestricted chat
      "metadata": {},
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### `POST /api/chat/conversations/:conversationId/messages`
Send a message to a conversation.

**Request (Plain Message - Unrestricted Chat):**
```json
{
  "content_type": "text",
  "content": "Hello world!",
  "metadata": {}
}
```

**Request (Encrypted Message - Legacy):**
```json
{
  "content_type": "text",
  "algorithm": "AES-GCM-256",
  "key_id": "msg-key-id",
  "ciphertext": "base64encrypted...",
  "iv": "base64iv...", 
  "aad": "base64aad...",
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "message": {
    "id": "new-msg-id",
    "conversation_id": "conv-id", 
    "sender_id": "user-id",
    "content_type": "text",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

## Database Schema

### ChatMessage Model
```javascript
{
  id: String (required, unique, indexed),
  conversation_id: String (required, indexed),
  sender_id: String (required, indexed),
  content_type: String (default: "text"),
  algorithm: String (default: "AES-GCM-256"),
  key_id: String (default: ""),
  ciphertext: String (optional), // base64 - optional for plain messages
  iv: String (optional), // base64 - optional for plain messages
  aad: String (default: ""),
  content: String (optional), // Plain text for unrestricted chat
  metadata: Mixed (default: {}),
  created_at: String (indexed),
  edited_at: String (default: null),
  deleted_at: String (default: null)
}
```

### ChatConversation Model
```javascript
{
  id: String (required, unique, indexed),
  type: String (required), // "direct" | "group"
  name: String (optional),
  memberIds: [String] (required),
  memberKeyEnvelopes: [Mixed] (optional), // Empty for unrestricted chat
  created_at: String (indexed),
  updated_at: String (indexed),
  last_message_meta: {
    sender_id: String,
    message_id: String,
    content_type: String,
    created_at: String
  }
}
```

### ChatIdentityKey Model
```javascript
{
  id: String (required, unique, indexed),
  user_id: String (required, indexed),
  key_id: String (required, indexed),
  algorithm: String (required),
  public_key_jwk: JsonWebKey (required),
  device_label: String (required),
  status: String (required),
  created_at: String (indexed),
  updated_at: String (indexed),
  last_seen_at: String (indexed)
}
```

## Real-time Events

### WebSocket Events

#### `chat:message:new`
Emitted when a new message is sent to any conversation the user is a member of.

**Payload:**
```json
{
  "conversation_id": "conv-id",
  "message": {
    "id": "msg-id",
    "conversation_id": "conv-id", 
    "sender_id": "user-id",
    "content_type": "text",
    "content": "Plain text message", // Plain content for unrestricted chat
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

#### `chat:message:updated`
Emitted when a message is updated (edited, read status changes, etc.).

## Security Considerations

### Unrestricted Chat
- No identity key requirements
- No encryption overhead
- Immediate message accessibility
- Compatible with all users

### Encrypted Chat (Legacy)
- End-to-end encryption using ECDH-P256 + AES-GCM-256
- Identity key requirements for all participants
- Forward secrecy support
- Zero-knowledge server architecture

## Error Handling

### Standard Error Response Format
```json
{
  "success": false,
  "message": "Human readable error description"
}
```

### Common HTTP Status Codes
- `200` - Success
- `201` - Created (message sent, conversation created)
- `400` - Bad Request (missing required fields)
- `401` - Unauthorized
- `403` - Forbidden (missing capabilities)
- `404` - Not Found (conversation doesn't exist)
- `500` - Internal Server Error

## Rate Limiting

- Message sending: 10 messages per minute per user
- Conversation creation: 5 conversations per hour per user
- User search: 20 searches per minute per user

## Testing

See `tests/e2e/endpoints.e2e.test.js` for comprehensive endpoint testing examples.

## Migration Notes

The system supports both encrypted and unrestricted chat modes:
1. **Existing encrypted conversations** continue working unchanged
2. **New unrestricted conversations** use plain messaging
3. **Mixed mode** - Both types can coexist in the same system

This dual approach ensures backward compatibility while enabling unrestricted chat for all users.
