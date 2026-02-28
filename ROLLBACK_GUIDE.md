# Backend Chat Route Rollback Guide

## Changes Made for Unrestricted Chat

### File: `api/routes/chat.js`

#### **Lines 264-270: Unrestricted Chat Logic**
```javascript
// Allow unrestricted chat without key envelopes
if (!Array.isArray(memberKeyEnvelopes) || memberKeyEnvelopes.length === 0) {
    // Create unrestricted conversation without encryption
    const now = new Date().toISOString();
    const conversation = new ChatConversation({
        id: uuidv4(),
        type: String(type || "direct"),
        name: String(name || ""),
        member_ids: normalizeMemberIds(authUserId, memberIds),
        created_by: authUserId,
        created_at: now,
        updated_at: now,
        member_key_envelopes: [], // Empty for unrestricted
        metadata: metadata || {},
    });
    
    await conversation.save();
    return res.status(201).json({
        success: true,
        conversation: sanitizeConversation(conversation),
    });
}
```

## Rollback Steps

### **Option 1: Full Rollback (Remove Unrestricted Chat)**
1. **Delete lines 264-270** (the unrestricted chat logic)
2. **Restore original validation** that requires `memberKeyEnvelopes`

### **Option 2: Keep Changes but Disable**
1. **Comment out lines 264-270**
2. **Add validation** to require `memberKeyEnvelopes`

### **Option 3: Git Rollback**
```bash
# Check git status
git status

# See what changed
git diff api/routes/chat.js

# Rollback specific file
git checkout -- api/routes/chat.js

# Or rollback to specific commit
git log --oneline
git checkout <commit-hash> -- api/routes/chat.js
```

## Testing After Rollback

1. **Restart backend server**
2. **Test chat creation** - should require encryption keys again
3. **Verify existing conversations** still work

## Notes

- The changes only affect **new conversation creation**
- **Existing conversations** will continue to work
- **Frontend** may need adjustment if relying on unrestricted chat
