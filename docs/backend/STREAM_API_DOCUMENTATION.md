# Stream API Documentation

The AbleGod Stream system provides a social-spiritual engagement platform where users can share reflections, engage via reactions, and curate content.

## Base Path: `/api/stream/*`

## Authentication & Capabilities
All endpoints require a valid JWT. Specific actions require the following capabilities:
- `stream:read` / `feed:read`: Basic access to view the stream and specific posts.
- `stream:create`: Ability to create new stream posts.
- `stream:reply` / `post:interact`: Ability to reply to posts or react/bookmark/restream.
- `stream:moderate`: Access to administration and moderation tools.
- `stream:feature`: Ability to feature posts on the explore feed.

---

## Post Management

### GET `/posts`
**Purpose**: List posts for a specific feed.
**Query Parameters**:
- `feed`: `following` (default), `explore`, `bookmarks`
- `status`: `published` (default), `draft`, `all`
- `limit`: Number of records (default: 30)

### GET `/posts/:id`
**Purpose**: Fetch a single post including its full reply thread.

### POST `/posts`
**Purpose**: Create a new reflection/stream post.
**Body**:
```json
{
  "title": "Post Title",
  "content": "Full content",
  "excerpt": "Short summary",
  "intent": "Reflection | Prayer | Praise | Testimony",
  "image_url": "Optional image URL",
  "status": "published | draft"
}
```

---

## Engagement & Social Actions

### PUT `/posts/:id/reaction`
**Purpose**: Toggle a reaction (like, amen, pray) on a post.
**Body**: `{ "reaction": "like" }`

### POST `/posts/:id/bookmark`
**Purpose**: Toggle bookmark status for the post.

### POST `/posts/:id/restream`
**Purpose**: Toggle restream (repost) status for the post.

### POST `/posts/:id/share`
**Purpose**: Increment share count (triggered on link copy or native share).

### POST `/posts/:id/view`
**Purpose**: Increment view count (triggered when opening a thread).

---

## Replies & Threads

### POST `/posts/:id/replies`
**Purpose**: Reply to a post or a parent reply.
**Body**:
```json
{
  "content": "Reply content",
  "parent_reply_id": "Optional UUID of the parent reply"
}
```

### PUT `/posts/:id/replies/:replyId/reaction`
**Purpose**: Toggle a reaction on a specific reply.

---

## Administration & Moderation

### GET `/admin/reports`
**Purpose**: Fetch the moderation queue (posts with active reports or restricted status).

### PATCH `/admin/posts/:id/moderation`
**Purpose**: Apply moderation actions to a post.
**Body**:
```json
{
  "action": "review | restrict | block | clear",
  "note": "Optional admin note",
  "clear_reports": boolean
}
```

### PATCH `/admin/posts/:id/feature`
**Purpose**: Promote a post to the featured section of the explore feed.
**Body**:
```json
{
  "featured": true,
  "editorial_boost": 0-10
}
```
