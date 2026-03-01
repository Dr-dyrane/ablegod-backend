# Stream & Chat Flow Diagram

This diagram illustrates the primary end-to-end sequence for a social stream post
and subsequent chat interaction. It can be referenced by developers and
new contributors to understand how data moves through the system.

```mermaid
sequenceDiagram
    participant U as User (Frontend)
    participant S as Stream Store / Service
    participant B as Backend API
    participant D as MongoDB
    participant P as Pusher (Realtime)
    participant N as Notification Store
    participant C as Chat Store / Service

    U->>S: createPost(payload + image URL)
    S->>B: POST /api/stream/posts
    B->>D: insert post document
    D-->>B: post record
    B->>P: emit notification:new (type=stream_post)
    P-->>N: persist notification record
    P-->>U: push event to followers
    U-->>S: receive updated feed via pull

    Note over U,C: User sees post and replies

    U->>S: createReply(postId, content)
    S->>B: POST /api/stream/posts/:id/replies
    B->>D: insert reply, fanout notifications
    B->>P: emit notification:new (type=stream_reply)
    P-->>N: persist notification, include chat handoff metadata
    P-->>U: push event to original author

    alt user wants private chat
        U->>C: openChatFromReply(metadata)
        C->>B: POST /api/chat/conversations { memberIds, keyEnvelopes }
        B->>D: find/insert conversation
        B-->>C: conversation record
    end

    C->>B: POST /api/chat/conversations/:id/messages (ciphertext)
    B->>D: insert message
    B->>P: emit chat:message:new
    P-->>U: push message event
    U->>C: decrypt message and render
```
```

> **Note**: this sequence omits error paths and authorization checks for brevity.
> Refer to `ARCHITECTURE_GUIDELINES.md` for security and capability details.
