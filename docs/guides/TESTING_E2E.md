# Endpoint E2E Testing (Auth -> Users -> Posts -> Stream -> Notifications -> Chat)

This backend now includes an endpoint-level E2E suite that runs against the **real Express app** with an **in-memory MongoDB**.

## What It Covers

The suite currently validates the main pivot-era endpoints added/reworked in the Node backend:

- `POST /api/auth/login`
- `POST /api/login` (compat alias)
- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/reset`
- `POST /api/users` (admin create)
- `GET /api/users/:id`
- `GET /api/users/:id/profile` (self/admin access)
- `POST /api/posts`
- `GET /api/posts/:id`
- `GET /api/stream/posts`
- `POST /api/stream/posts`
- `GET /api/stream/posts/:id`
- `GET /api/stream/posts/:id/replies`
- `POST /api/stream/posts/:id/replies`
- `PUT /api/stream/posts/:id/reaction`
- `PUT /api/stream/posts/:postId/replies/:replyId/reaction`
- `GET /api/stream/follows/me`
- `GET /api/stream/suggestions`
- `PUT /api/stream/follows/:userId`
- `GET /api/notifications`
- `POST /api/notifications`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`
- `GET /api/chat/identity-keys/me`
- `PUT /api/chat/identity-keys/me`
- `GET /api/chat/identity-keys/:userId`
- `GET /api/chat/participants`
- `GET /api/chat/conversations`
- `POST /api/chat/conversations` (direct + group)
- `GET /api/chat/conversations/:conversationId`
- `GET /api/chat/conversations/:conversationId/messages`
- `POST /api/chat/conversations/:conversationId/messages`

It also checks a few authorization failures (403s) to ensure route protection is active.

The stream coverage also validates the social reply loop at endpoint level:

- member creates a stream post
- another member replies
- post reply count increments
- reply author activity creates a notification for the original post author
- post/reply reactions update counts and persist reaction notifications with stream metadata
- follow suggestions/snapshot endpoints return usable graph data
- follow/unfollow updates persist and affect `feed=following` results
- follow activity creates a notification for the followed user

The auth coverage also validates password recovery:

- request password reset (`forgot`)
- reset password using token
- old password fails, new password succeeds

## How It Works

- Uses `node:test`
- Uses `supertest` to hit the imported Express app
- Uses `mongodb-memory-server` so tests do not require a local MongoDB instance
- Imports `api/index.js` without binding a real port (`server.listen(...)` is skipped when required in tests)

## Run Commands

From `ablegod-backend`:

```bash
npm run test:e2e:endpoints
```

Windows PowerShell:

```powershell
.\scripts\test-e2e-endpoints.ps1
```

Bash:

```bash
./scripts/test-e2e-endpoints.sh
```

## Notes

- The suite sets its own test env (`JWT_SECRET`, `MONGODB_URI`, `PORT=0`).
- Google Analytics env vars are **not required** for this suite.
- SMTP/email env vars are **not required** for this suite (`password/forgot` skips SMTP send in test mode and returns a debug token only in tests).
- `public/uploads/` is created automatically if missing (upload route safety; upload endpoint is not currently part of this suite).

## Current Known Backend Bug Fixed During Test Rollout

The E2E suite exposed a real login bug:

- `User.activities` schema was unintentionally compiled as `string[]` because of the `type` key shorthand.
- Fixed by defining `activities[].type` as `{ type: String }`.

This is now covered by the auth login test path.
