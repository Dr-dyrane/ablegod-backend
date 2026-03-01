# AbleGod Backend Documentation Index

This directory contains the technical documentation for the `ablegod-backend` Node.js service.

## 📂 Hierarchy Overview

### 🏛️ [Architecture](./architecture/)
- [API_OVERVIEW.md](./architecture/API_OVERVIEW.md) — Comprehensive map of all backend route domains.

### 🔑 [Core](./core/)
- [MONGODB_SCHEMAS.md](./core/MONGODB_SCHEMAS.md) — Mongoose model definitions and collection structures.

### 🌊 [Social (Stream)](./social/)
- [STREAM_API.md](./social/STREAM_API.md) — Documentation for `/api/stream/*` endpoints.

### 💬 [Messaging](./messaging/)
- [CHAT_API.md](./messaging/CHAT_API.md) — Documentation for `/api/chat/*` endpoints.

### 📖 [Guides](./guides/)
- [BACKEND_MANUAL.md](./guides/BACKEND_MANUAL.md) — Implementation guide and setup instructions.
- [TESTING_E2E.md](./guides/TESTING_E2E.md) — Endpoint testing strategies and E2E coverage.

---

## 🛠️ Maintenance Rules
1. **Schema Sync**: Always update `core/MONGODB_SCHEMAS.md` when changing a Mongoose model.
2. **Contract First**: Document new API endpoints in the appropriate domain file before implementation.
3. **E2E Validation**: New endpoints must have a corresponding test case in the E2E guide.
