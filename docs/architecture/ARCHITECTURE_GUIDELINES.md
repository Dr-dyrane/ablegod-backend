# Architecture & Development Guidelines

This document provides high-level direction for contributors, maintainers, and reviewers. It is intended to make the codebase behave like a production-grade system: safe, scalable, understandable, and easy to roll back or extend.

## 🧱 Core Architectural Principles

1. **Layered structure**
   - **Routes** (`/api/routes/*`): Express routers grouped by domain. Keep each file small; core logic should reside in services or models.
   - **Services / Store (frontend)**: Encapsulate API calls and business logic. `*/service.ts` files should be thin wrappers around `apiClient`.
   - **Data models**: Mongoose schemas under `api/models`; include sanitizers and normalization helpers in `_helpers.js` or dedicated utility modules.
   - **UI components**: Route-specific components live under `src/components`; workspace-level components under directories named for their shell (e.g. `user`, `admin`, `chat`).
   - **State management** (frontend): `src/store` uses Pinia-style stores (`zustand`-like). Avoid putting business logic in components.

2. **Capability-based authorization**
   - All protected routes use `requireCapabilities` or role derived helpers (`requireAdminOrAuthor`).
   - Capabilities are derived from user roles and can be overridden by session tokens. See `src/services/capabilitySession.ts`.
   - **Rule**: Never hardcode role checks in routes—use capability middleware to keep rules consistent and testable.

3. **Real-time and events**
   - Use `realtimeClient` on frontend and Pusher on backend. Bind/unbind events consistently.
   - Notification emission helpers (e.g. `emitNotificationEvent`) must always sanitize payloads to avoid leaking sensitive fields.

4. **Upload & media pipeline**
   - Default strategy: direct Cloudinary upload from the frontend using `uploadImageToCloudinary` helper.
   - Backend `/api/upload` serves as a general-purpose fallback and a future server-side pipeline. Guarded by `requireCapabilities("stream:create")` so that anyone who can make a stream post can upload media. This aligns with current authorization and was previously restricted to admins/authors.
   - **Design note**: keep attachments metadata encrypted in messages when necessary; message bodies remain text or ciphertext.
   - **Streaming tags/search**: posts include an optional `metadata.tags` array for hashtags. Backend already supports full‑text search via a `q` parameter on `/api/stream/posts`; `/api/stream/tags/trending` returns recent popular tags. A similar lightweight keyword filter (`q`) is available for the blog listing (`/api/posts`). Rate‑limit search to protect performance. Coral's AI moderation service (or similar) should vet query results and trending data to enforce the spiritual guardrail.

- **Frontend search routing**: there are now three UI entry points (`/search`, `/search/blog` and `/user/search`). The search page accepts query parameters (`?q=` and `tab=`) to preserve user state and support deep‑links; tabs allow users to toggle between Top/Latest/People/Media results. `/user/search` keeps users inside the hub so the bottom pill never navigates off‑domain. When adding new pages or domains that require their own search flows, mirror this pattern and update helper `computeSearchPath` in `MobileShellContext`.

- **Navigation pill** (mobile user shell): reduce to three icons—stream/home, current page, and explore/next. Remove alerts from the pill; notifications live in the sheet. Provide a persistent search button next to the notification bell in the header. This layout scales below `xl`; desktop layouts continue to use sidebar/legacy navbar but should adopt the same conceptual ordering when refactored. Ensure keyboard focus, aria labels, and responsive hit‑target sizing meet a11y constraints.

5. **Error handling & logging**
   - Routes should catch errors and respond with `500` plus `{ success: false, message }`. Use helper `authError` for auth issues.
   - Avoid unhandled promise rejections; every `async` route should have try/catch.
   - Prefer a centralized logger (e.g. `pino` or `winston`) for production. Current `console.error` calls are transitional; flag them with `// TODO: replace with logger` in audit.

6. **Tests**
   - E2E tests live under `tests/e2e` and exercise key workflows end-to-end (auth → stream → notifications → chat, etc.).
   - Add tests for any new endpoint, particularly upload or media flows.
   - **Guideline**: unit tests are light; focus on integration and smoke tests. Leverage contract tests for API docs when possible.

7. **Documentation**
   - Primary docs are in `docs/architecture` and `docs/messaging`.
   - Update `PIVOT_TRACKER.md` each time a new deliverable completes or a gate is crossed.
   - Endpoint-level docs (`CHAT_API.md`, future `STREAM_API.md`) should be automatically generated or at least reviewed alongside route changes.
   - Inline code comments are welcome for complex logic; use `/** ... */` style and reference external docs if needed.

8. **Contribution & rollback**
   - Branch naming: `feature/<short-desc>`, `fix/<issue>`, `chore/docs-...`.
   - Commit messages must reference the tracker task or issue id (if available) and include `docs:` when adding or updating documentation.
   - Pull requests require:
     1. Description of the change
     2. Updated tests (if applicable)
     3. Documentation updates (link to docs or state "none needed")
     4. Review by at least one other developer
   - To roll back, use `git revert` on the merge commit and update the tracker to reflect status.

## 🛡 Security & best practices

### Response Envelope Consistency

Routes should return a uniform JSON envelope to simplify client handling. The agreed format is:

```json
{
  "success": true | false,
  "message"?: "Human readable summary",
  "data"?: { /* payload */ },
  "error"?: "detailed error string" // use sparingly
}
```

- `success` must always be present.
- Prefer `message` over `error` when providing human-oriented text.
- Use `data` for results rather than injecting fields at the top level.

Legacy modules (e.g. `api/routes/user.js`) currently return `{ error: "" }` on failure;
these should be refactored incrementally. New code should adhere to the uniform
format. Adding a shared helper (e.g. `jsonResponse(res, 200, { success: true, data }))`
can help enforce this.

## 🛡 Security & best practices

- **Input validation**: sanitize all user input at route boundaries. Prefer schema validation libraries (`joi`, `zod`) for complex payloads.
- **Data exposure**: only return fields explicitly needed by clients. Use sanitizers in models (see `_helpers.js` for examples) to avoid leaking passwords, tokens, etc.
- **Rate limiting**: apply rudimentary rate limits on public endpoints (login, chat messages, upload) using express middleware or a gateway service.
- **Encryption**: chat messages are encrypted with ECDH-P256 + AES-GCM-256 when identity keys are present. Ensure keys are rotated and decrypted only on client.

## 🔗 Flow diagrams & examples

(Place diagrams here or link to generated Mermaid diagrams in `docs/architecture/diagrams`.)

### Example: Stream post + notification
```
User UI -> streamService.createPost -> POST /api/stream/posts
Backend saves post -> emits notification via pusher -> update notification store -> UI receives chat handoff
```

### Example: Chat key registration & message send
```
Client exports JWK -> chatService.registerIdentityKey -> /api/chat/identity-keys/me
Client creates conversation -> /api/chat/conversations
Client sends encrypted message -> /api/chat/conversations/:id/messages
Backend persists ciphertext + emits chat:message event -> clients decrypt
```

## 🧩 Scalability considerations

- **Database**: MongoDB used; ensure appropriate indexes (`memberIds`, `conversation_id`, `created_at`). See `API_OVERVIEW.md` for index list.
- **Horizontal scaling**: stateless Node processes, shared Mongo and Pusher. Session tokens JWT-based; load balancer required when DNS-level scaling.
- **Media service**: plan to replace `/api/upload` with an S3/Blob store or Postgres bytea + CDN for video. Decouple upload service behind a facade.

## 📦 Deployment & environment

- `.env` variables are documented in both backend and frontend READMEs.
- Use `docker-compose` or serverless depending on environment. Simplify by keeping secrets in environment.

## ✅ Checklist before merging

- [ ] Code builds without lint/compile errors
- [ ] Existing tests pass and new tests added
- [ ] Documentation updated (API, tracker, guides)
- [ ] No `TODO` comments remain unaddressed; if they do, create corresponding issue
- [ ] Peer-reviewed and approved

---

This file should be referenced from top-level READMEs and kept in sync with evolving architecture. Updates to core patterns (e.g. switching to TypeScript backend) must update this guide accordingly.
