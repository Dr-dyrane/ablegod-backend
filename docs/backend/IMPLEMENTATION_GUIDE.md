# Chat System Implementation Guide

## Overview

This guide explains the implementation details of AbleGod's dual-mode chat system supporting both encrypted end-to-end messaging and unrestricted plain messaging.

## Architecture Philosophy

The chat system is designed with **dual compatibility** in mind:
1. **Backward Compatibility** - Existing encrypted conversations continue working unchanged
2. **Future Flexibility** - New unrestricted chat provides immediate accessibility
3. **Gradual Migration** - Users can transition between modes seamlessly
4. **Performance Optimization** - Plain messages avoid encryption overhead

## Message Flow Architecture

### Frontend Message Processing

```javascript
// Message normalization prioritizes plain content
async function normalizeMessage(message, options) {
  // 1. Check for plain content first (unrestricted chat)
  if (message.content && typeof message.content === "string") {
    return {
      id: message.id,
      conversationId: message.conversation_id,
      senderId: message.sender_id,
      content: message.content, // Plain text - immediate display
      isLocked: false,
      // ... other fields
    };
  }

  // 2. Fallback to encrypted handling (legacy)
  const decrypted = await tryDecryptMessageWithKey(message, keyBase64);
  return {
    id: message.id,
    conversationId: message.conversation_id,
    senderId: message.sender_id,
    decryptedText: decrypted.decryptedText,
    isLocked: decrypted.isLocked,
    // ... other fields
  };
}
```

### Backend Message Handling

```javascript
// Dual format support in message endpoint
router.post("/conversations/:conversationId/messages", async (req, res) => {
  const {
    content_type = "text",
    algorithm = "AES-GCM-256", 
    key_id = "",
    ciphertext,      // Encrypted content (legacy)
    iv,             // Initialization vector (legacy)
    aad = "",        // Additional authenticated data (legacy)
    content,        // Plain content (unrestricted)
    metadata = {}
  } = req.body;

  // Validation: Accept either encrypted OR plain content
  if (!ciphertext && !content) {
    return res.status(400).json({ 
      success: false, 
      message: "Either ciphertext or content is required" 
    });
  }

  // Store message with appropriate fields
  const message = new ChatMessage({
    id: uuidv4(),
    conversation_id: req.chatConversation.id,
    sender_id: authUserId,
    content_type: String(content_type || "text"),
    algorithm: String(algorithm || "AES-GCM-256"),
    key_id: String(key_id || ""),
    ciphertext: String(ciphertext || ""),      // Empty for plain messages
    iv: String(iv || ""),                 // Empty for plain messages
    aad: String(aad || ""),
    content: String(content || ""),           // Plain text for unrestricted
    metadata,
    created_at: new Date().toISOString()
  });

  await message.save();
  emitChatMessage(req.chatConversation, message);
  return res.status(201).json({ success: true, message });
});
```

## Conversation Creation Strategy

### Unrestricted Conversations (New Default)

```javascript
// Frontend: Simple conversation creation
const newConversationId = await createDirectConversation({
  participant: {
    id: userId,
    name: userName,
    username: userUsername
  }
});

// Backend: No key envelopes required
const response = await chatService.createConversation({
  type: "direct",
  name: participant.name,
  memberIds: [participant.id],
  memberKeyEnvelopes: [] // Empty for unrestricted chat
});
```

### Encrypted Conversations (Legacy Support)

```javascript
// Frontend: Full encryption workflow
const newConversationId = await createDirectConversation({
  participant: {
    id: userId,
    name: userName,
    username: userUsername
  }
});

// Backend: Complete key envelope generation
const response = await chatService.createConversation({
  type: "direct", 
  name: participant.name,
  memberIds: [participant.id],
  memberKeyEnvelopes: [
    {
      user_id: senderId,
      key_id: senderKeyId,
      algorithm: "AES-GCM-256",
      encrypted_key: encryptedConversationKey,
      iv: encryptionIv,
      conversation_key_id: conversationKeyId
    },
    {
      user_id: recipientId,
      key_id: recipientKeyId,
      algorithm: "AES-GCM-256", 
      encrypted_key: encryptedForRecipient,
      iv: encryptionIv,
      conversation_key_id: conversationKeyId
    }
  ]
});
```

## Database Schema Design

### Flexible Message Storage

```javascript
// ChatMessage schema supports both formats
const chatMessageSchema = new mongoose.Schema({
  // Core fields (always required)
  id: { type: String, required: true, unique: true, index: true },
  conversation_id: { type: String, required: true, index: true },
  sender_id: { type: String, required: true, index: true },
  content_type: { type: String, default: "text" },
  created_at: { type: String, default: () => new Date().toISOString(), index: true },
  
  // Encryption fields (optional for unrestricted chat)
  algorithm: { type: String, default: "AES-GCM-256" },
  key_id: { type: String, default: "" },
  ciphertext: { type: String, required: false }, // Optional for plain messages
  iv: { type: String, required: false },      // Optional for plain messages
  aad: { type: String, default: "" },
  
  // Unrestricted chat field
  content: { type: String, required: false }, // Plain text content
  
  // Metadata and soft deletes
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  edited_at: { type: String, default: null },
  deleted_at: { type: String, default: null }
});
```

### Conversation Access Control

```javascript
// memberKeyEnvelopes indicates conversation security level
const chatConversationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  type: { type: String, required: true, enum: ["direct", "group"] },
  name: { type: String, required: false },
  memberIds: { type: [String], required: true, index: true },
  
  // Empty = unrestricted chat
  // Populated = encrypted conversations
  memberKeyEnvelopes: { 
    type: [mongoose.Schema.Types.Mixed], 
    required: false, 
    default: [] 
  },
  
  // Timestamps and metadata
  created_at: { type: String, default: () => new Date().toISOString(), index: true },
  updated_at: { type: String, default: () => new Date().toISOString(), index: true },
  last_message_meta: {
    sender_id: { type: String, required: false },
    message_id: { type: String, required: false },
    content_type: { type: String, required: false },
    created_at: { type: String, required: false }
  }
});
```

## Real-time Communication

### WebSocket Event Design

```javascript
// Unified message event supports both formats
function emitChatMessage(conversation, message) {
  pusher.trigger(`chat-conversation-${conversation.id}`, 'chat:message:new', {
    conversation_id: conversation.id,
    message: {
      id: message.id,
      conversation_id: message.conversation_id,
      sender_id: message.sender_id,
      content_type: message.content_type,
      // Plain content for unrestricted messages
      content: message.content || null,
      // Encrypted content for legacy messages  
      ciphertext: message.ciphertext || null,
      iv: message.iv || null,
      created_at: message.created_at
    }
  });
}
```

### Room Management Strategy

```javascript
// Automatic room subscription for conversation members
function syncConversationRooms() {
  const conversations = get().conversations;
  const principalUserId = get().principalUserId;
  
  conversations.forEach(conversation => {
    if (conversation.memberIds.includes(principalUserId)) {
      realtimeClient.joinConversationRoom(conversation.id);
    } else {
      realtimeClient.leaveConversationRoom(conversation.id);
    }
  });
}
```

## Security Considerations

### Unrestricted Chat Security Model

**Advantages:**
- ✅ **Immediate Accessibility** - No key generation delays
- ✅ **Universal Compatibility** - Works with all users
- ✅ **Performance Optimized** - No encryption overhead
- ✅ **Simple User Experience** - No technical complexity

**Trade-offs:**
- ⚠️ **Server Accessible** - Messages stored in plain text on server
- ⚠️ **No Forward Secrecy** - Server compromise reveals message history
- ⚠️ **No End-to-End Encryption** - Messages interceptable in transit

### Encrypted Chat Security Model (Legacy)

**Advantages:**
- 🔒 **End-to-End Encryption** - Server cannot access message content
- 🔒 **Forward Secrecy** - Compromise reveals limited metadata
- 🔒 **Zero-Knowledge Server** - Server stores only encrypted data

**Trade-offs:**
- ⚠️ **Key Management Complexity** - Users must manage identity keys
- ⚠️ **Access Delays** - Key verification required for new devices
- ⚠️ **Performance Overhead** - Encryption/decryption processing time

## Migration Path

### Phase 1: Dual Support (Current)
- Both encrypted and unrestricted conversations coexist
- Users choose mode per conversation
- Automatic format detection in message processing

### Phase 2: Preference-Based (Future)
- User settings for default chat mode
- Automatic conversation creation based on preferences
- Migration tools for existing conversations

### Phase 3: Unified System (Future Goal)
- Single flexible message format
- User-controlled encryption per conversation
- Seamless upgrade/downgrade capabilities

## Performance Optimization

### Database Query Patterns

```javascript
// Optimized conversation loading
const conversations = await ChatConversation.find({
  memberIds: { $in: [userId] },
  updated_at: -1 // Sort by most recent
}).limit(50).populate('last_message_meta');

// Efficient message pagination
const messages = await ChatMessage.find({
  conversation_id: conversationId,
  created_at: -1 // Chronological order
})
.limit(100)
.skip(offset);
```

### Caching Strategy

```javascript
// Conversation list caching
const conversationCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedConversations(userId) {
  const cached = conversationCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  // Fetch from database and cache result
}
```

### Real-time Optimizations

```javascript
// Batch message delivery
const messageQueue = new Map();
setInterval(() => {
  const messages = Array.from(messageQueue.values());
  messageQueue.clear();
  
  messages.forEach(msg => {
    emitChatMessage(msg.conversation, msg);
  });
}, 100); // Process every 100ms
```

## Testing Strategy

### Unit Testing
```javascript
// Message format detection
describe('Message Processing', () => {
  it('should prioritize plain content over encrypted', () => {
    const plainMessage = { content: 'Hello', content_type: 'text' };
    const encryptedMessage = { ciphertext: 'encrypted...', content_type: 'text' };
    
    expect(normalizeMessage(plainMessage)).to.have.property('content', 'Hello');
    expect(normalizeMessage(encryptedMessage)).to.have.property('decryptedText');
  });
});
```

### Integration Testing
```javascript
// End-to-end conversation flow
describe('Conversation Creation', () => {
  it('should create unrestricted conversation', async () => {
    const response = await request(app)
      .post('/api/chat/conversations')
      .send({
        type: 'direct',
        name: 'Test User',
        memberIds: [testUser.id],
        memberKeyEnvelopes: [] // Unrestricted
      })
      .expect(201);
      
    expect(response.body.conversation.memberKeyEnvelopes).toEqual([]);
  });
});
```

This implementation provides a robust, scalable chat system that supports both security models while maintaining high performance and user experience quality.
