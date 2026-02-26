const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;
let backend;
let app;
let server;
let io;

let adminToken;
let memberToken;
let peerToken;

let adminUser;
let memberUser;
let peerUser;
let createdManagedUser;

let createdPost;
let createdStreamPost;
let createdStreamReply;
let createdNotification;
let createdConversation;
let createdMessage;

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

function makeDummyJwk(suffix = "1") {
  return {
    kty: "EC",
    crv: "P-256",
    x: `dummy-x-${suffix}`,
    y: `dummy-y-${suffix}`,
    ext: true,
    key_ops: [],
  };
}

async function waitForMongooseConnection(connection, timeoutMs = 10000) {
  if (connection.readyState === 1) return;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for mongoose connection"));
    }, timeoutMs);

    const onConnected = () => {
      cleanup();
      resolve();
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      connection.off("connected", onConnected);
      connection.off("error", onError);
    };

    connection.on("connected", onConnected);
    connection.on("error", onError);
  });
}

test.before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "ablegod-e2e-jwt-secret";
  process.env.PORT = "0";

  const uploadsDir = path.join(__dirname, "../../public/uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });

  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri("ablegod_backend_e2e");

  backend = require("../../api/index");
  app = backend.app;
  server = backend.server;
  io = backend.io;

  await waitForMongooseConnection((backend.mongoose || mongoose).connection);
});

test.after(async () => {
  try {
    if (io) {
      await io.close();
    }
  } catch {
    // no-op
  }

  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  } catch {
    // no-op
  }

  try {
    await (backend.mongoose || mongoose).disconnect();
  } catch {
    // no-op
  }

  if (mongoServer) {
    await mongoServer.stop();
  }
});

test("Endpoint E2E suite: auth -> users -> posts -> stream -> notifications -> chat", async (t) => {
  const User = require("../../api/models/user");

  await t.test("seed admin and verify /api/auth/login + /api/auth/me + /api/login alias", async () => {
    adminUser = await User.create({
      id: "admin-e2e",
      username: "admin-e2e",
      email: "admin.e2e@ablegod.test",
      role: "admin",
      status: "active",
      password: "adminpass123", // plaintext on purpose to validate legacy migration path
      createdAt: new Date().toISOString(),
      lastLogin: "",
      activities: [],
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      username: "admin-e2e",
      password: "adminpass123",
    });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);
    assert.ok(loginRes.body.token);
    assert.equal(loginRes.body.user.role, "admin");
    assert.ok(Array.isArray(loginRes.body.user.capabilities));
    assert.ok(loginRes.body.user.capabilities.includes("users:write:admin"));
    adminToken = loginRes.body.token;

    const migratedAdmin = await User.findOne({ id: "admin-e2e" });
    assert.ok(/^\$2[aby]\$/.test(String(migratedAdmin.password || "")));

    const meRes = await request(app)
      .get("/api/auth/me")
      .set(authHeader(adminToken));
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.success, true);
    assert.equal(String(meRes.body.user.id), "admin-e2e");

    const aliasLoginRes = await request(app).post("/api/login").send({
      username: "admin-e2e",
      password: "adminpass123",
    });
    assert.equal(aliasLoginRes.status, 200);
    assert.equal(aliasLoginRes.body.success, true);

    const emailLoginRes = await request(app).post("/api/auth/login").send({
      email: "admin.e2e@ablegod.test",
      password: "adminpass123",
    });
    assert.equal(emailLoginRes.status, 200);
    assert.equal(emailLoginRes.body.success, true);
    assert.ok(emailLoginRes.body.token);
  });

  await t.test("register member users and enforce public role downgrade", async () => {
    const registerMember = await request(app).post("/api/auth/register").send({
      username: "member-e2e",
      email: "member.e2e@ablegod.test",
      password: "memberpass123",
      name: "Member E2E",
      role: "admin", // should be downgraded for public register
    });
    assert.equal(registerMember.status, 201);
    assert.equal(registerMember.body.success, true);
    assert.equal(registerMember.body.user.role, "user");
    memberUser = registerMember.body.user;

    const registerPeer = await request(app).post("/api/auth/register").send({
      username: "peer-e2e",
      email: "peer.e2e@ablegod.test",
      password: "peerpass123",
      name: "Peer E2E",
      role: "author",
    });
    assert.equal(registerPeer.status, 201);
    assert.equal(registerPeer.body.user.role, "user");
    peerUser = registerPeer.body.user;

    const memberLogin = await request(app).post("/api/auth/login").send({
      username: "member-e2e",
      password: "memberpass123",
    });
    assert.equal(memberLogin.status, 200);
    memberToken = memberLogin.body.token;
    assert.ok(memberToken);

    const peerLogin = await request(app).post("/api/auth/login").send({
      username: "peer-e2e",
      password: "peerpass123",
    });
    assert.equal(peerLogin.status, 200);
    peerToken = peerLogin.body.token;
    assert.ok(peerToken);
  });

  await t.test("password recovery endpoints: forgot + reset + login with new password", async () => {
    const forgotRes = await request(app).post("/api/auth/password/forgot").send({
      email: "member.e2e@ablegod.test",
    });
    assert.equal(forgotRes.status, 200);
    assert.equal(forgotRes.body.success, true);
    assert.ok(forgotRes.body.debug?.reset_token);

    const resetRes = await request(app).post("/api/auth/password/reset").send({
      email: "member.e2e@ablegod.test",
      token: forgotRes.body.debug.reset_token,
      password: "memberpass456",
    });
    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.body.success, true);

    const oldPasswordLoginRes = await request(app).post("/api/auth/login").send({
      username: "member-e2e",
      password: "memberpass123",
    });
    assert.equal(oldPasswordLoginRes.status, 401);

    const newPasswordLoginRes = await request(app).post("/api/auth/login").send({
      username: "member-e2e",
      password: "memberpass456",
    });
    assert.equal(newPasswordLoginRes.status, 200);
    assert.equal(newPasswordLoginRes.body.success, true);
    memberToken = newPasswordLoginRes.body.token;
    assert.ok(memberToken);
  });

  await t.test("admin user endpoints: POST /api/users and GET /api/users/:id", async () => {
    const createUserRes = await request(app)
      .post("/api/users")
      .set(authHeader(adminToken))
      .send({
        username: "managed-e2e",
        email: "managed.e2e@ablegod.test",
        password: "managedpass123",
        role: "author",
        status: "active",
        name: "Managed Author",
      });

    assert.equal(createUserRes.status, 201);
    assert.equal(createUserRes.body.username, "managed-e2e");
    assert.equal(createUserRes.body.role, "author");
    createdManagedUser = createUserRes.body;

    const getUserRes = await request(app)
      .get(`/api/users/${encodeURIComponent(String(createdManagedUser.id))}`)
      .set(authHeader(adminToken));
    assert.equal(getUserRes.status, 200);
    assert.equal(String(getUserRes.body.id), String(createdManagedUser.id));

    const selfProfileRes = await request(app)
      .get(`/api/users/${encodeURIComponent(String(memberUser.id))}/profile`)
      .set(authHeader(memberToken));
    assert.equal(selfProfileRes.status, 200);
    assert.ok(selfProfileRes.body.profile);
    assert.equal(String(selfProfileRes.body.profile.id), String(memberUser.id));
  });

  await t.test("posts endpoints: create + get by id (new endpoint)", async () => {
    const createPostRes = await request(app)
      .post("/api/posts")
      .set(authHeader(adminToken))
      .send({
        id: 1001,
        title: "E2E Stream Post",
        excerpt: "E2E excerpt",
        content: "E2E content body",
        category: "AbleGod Stream",
        subcategory: "stream",
        date: new Date().toLocaleDateString(),
        readTime: "1 min",
        author: "E2E Author",
        status: "published",
        comments: [],
        likes: 0,
        downloads: 0,
        tags: ["stream", "e2e"],
      });
    assert.equal(createPostRes.status, 201);
    createdPost = createPostRes.body;
    assert.equal(createdPost.title, "E2E Stream Post");

    const getPostRes = await request(app).get(`/api/posts/${createdPost.id}`);
    assert.equal(getPostRes.status, 200);
    assert.equal(getPostRes.body.id, createdPost.id);
    assert.equal(getPostRes.body.subcategory, "stream");
  });

  await t.test("notifications endpoints: create/list/read/read-all", async () => {
    const createNotificationRes = await request(app)
      .post("/api/notifications")
      .set(authHeader(memberToken))
      .send({
        type: "comment",
        message: "Someone replied to your stream post",
        post_id: createdPost.id,
        post_title: createdPost.title,
      });

    assert.equal(createNotificationRes.status, 201);
    assert.equal(createNotificationRes.body.success, true);
    createdNotification = createNotificationRes.body.notification;
    assert.equal(String(createdNotification.user_id), String(memberUser.id));

    const listNotificationsRes = await request(app)
      .get("/api/notifications")
      .set(authHeader(memberToken));
    assert.equal(listNotificationsRes.status, 200);
    assert.equal(listNotificationsRes.body.success, true);
    assert.ok(Array.isArray(listNotificationsRes.body.notifications));
    assert.ok(
      listNotificationsRes.body.notifications.some(
        (n) => String(n.id) === String(createdNotification.id)
      )
    );

    const markReadRes = await request(app)
      .patch(`/api/notifications/${encodeURIComponent(String(createdNotification.id))}/read`)
      .set(authHeader(memberToken));
    assert.equal(markReadRes.status, 200);
    assert.equal(markReadRes.body.success, true);
    assert.equal(markReadRes.body.notification.is_read, true);

    await request(app)
      .post("/api/notifications")
      .set(authHeader(memberToken))
      .send({
        type: "system",
        message: "Second unread notification",
      })
      .expect(201);

    const readAllRes = await request(app)
      .patch("/api/notifications/read-all")
      .set(authHeader(memberToken))
      .send({});
    assert.equal(readAllRes.status, 200);
    assert.equal(readAllRes.body.success, true);
    assert.ok(Number(readAllRes.body.matchedCount) >= 1);
  });

  await t.test("stream endpoints: create/list/get/replies and stream-reply notification fanout persistence", async () => {
    const createStreamPostRes = await request(app)
      .post("/api/stream/posts")
      .set(authHeader(memberToken))
      .send({
        title: "Stream E2E Reflection",
        content: "God is faithful in every season.",
        excerpt: "God is faithful in every season.",
        intent: "Reflection",
        status: "published",
        metadata: { source: "e2e-test" },
      });

    assert.equal(createStreamPostRes.status, 201);
    assert.equal(createStreamPostRes.body.success, true);
    createdStreamPost = createStreamPostRes.body.post;
    assert.equal(createdStreamPost.intent, "Reflection");
    assert.equal(String(createdStreamPost.author_user_id), String(memberUser.id));

    const listStreamPostsRes = await request(app)
      .get("/api/stream/posts")
      .set(authHeader(memberToken))
      .query({ limit: 10, feed: "following" });
    assert.equal(listStreamPostsRes.status, 200);
    assert.equal(listStreamPostsRes.body.success, true);
    assert.equal(listStreamPostsRes.body.feed, "following");
    assert.ok(Array.isArray(listStreamPostsRes.body.posts));
    assert.ok(
      listStreamPostsRes.body.posts.some(
        (post) => String(post.id) === String(createdStreamPost.id)
      )
    );

    const getStreamPostRes = await request(app)
      .get(`/api/stream/posts/${encodeURIComponent(String(createdStreamPost.id))}`)
      .set(authHeader(peerToken));
    assert.equal(getStreamPostRes.status, 200);
    assert.equal(getStreamPostRes.body.success, true);
    assert.equal(String(getStreamPostRes.body.post.id), String(createdStreamPost.id));

    const createStreamReplyRes = await request(app)
      .post(`/api/stream/posts/${encodeURIComponent(String(createdStreamPost.id))}/replies`)
      .set(authHeader(peerToken))
      .send({
        content: "Amen. Thank you for sharing this encouragement.",
        metadata: { source: "e2e-reply" },
      });
    assert.equal(createStreamReplyRes.status, 201);
    assert.equal(createStreamReplyRes.body.success, true);
    createdStreamReply = createStreamReplyRes.body.reply;
    assert.equal(String(createdStreamReply.post_id), String(createdStreamPost.id));
    assert.equal(String(createStreamReplyRes.body.post.id), String(createdStreamPost.id));
    assert.equal(Number(createStreamReplyRes.body.post.reply_count), 1);

    const listStreamRepliesRes = await request(app)
      .get(`/api/stream/posts/${encodeURIComponent(String(createdStreamPost.id))}/replies`)
      .set(authHeader(memberToken));
    assert.equal(listStreamRepliesRes.status, 200);
    assert.equal(listStreamRepliesRes.body.success, true);
    assert.ok(Array.isArray(listStreamRepliesRes.body.replies));
    assert.ok(
      listStreamRepliesRes.body.replies.some(
        (reply) => String(reply.id) === String(createdStreamReply.id)
      )
    );

    const postReactionRes = await request(app)
      .put(`/api/stream/posts/${encodeURIComponent(String(createdStreamPost.id))}/reaction`)
      .set(authHeader(peerToken))
      .send({ reaction_type: "amen" });
    assert.equal(postReactionRes.status, 200);
    assert.equal(postReactionRes.body.success, true);
    assert.equal(postReactionRes.body.reaction_type, "amen");
    assert.equal(Number(postReactionRes.body.post.reaction_counts.amen), 1);

    const replyReactionRes = await request(app)
      .put(
        `/api/stream/posts/${encodeURIComponent(String(createdStreamPost.id))}/replies/${encodeURIComponent(
          String(createdStreamReply.id)
        )}/reaction`
      )
      .set(authHeader(memberToken))
      .send({ reaction_type: "pray" });
    assert.equal(replyReactionRes.status, 200);
    assert.equal(replyReactionRes.body.success, true);
    assert.equal(replyReactionRes.body.reaction_type, "pray");
    assert.equal(Number(replyReactionRes.body.reply.reaction_counts.pray), 1);

    const getStreamPostAfterReactionRes = await request(app)
      .get(`/api/stream/posts/${encodeURIComponent(String(createdStreamPost.id))}`)
      .set(authHeader(peerToken));
    assert.equal(getStreamPostAfterReactionRes.status, 200);
    assert.equal(getStreamPostAfterReactionRes.body.post.viewer_reaction, "amen");

    const streamReplyNotificationRes = await request(app)
      .get("/api/notifications")
      .set(authHeader(memberToken))
      .query({ limit: 50 });
    assert.equal(streamReplyNotificationRes.status, 200);
    const streamReplyNotification = streamReplyNotificationRes.body.notifications.find(
      (notification) =>
        notification?.metadata?.kind === "stream_reply" &&
        String(notification?.metadata?.stream_post_id) === String(createdStreamPost.id)
    );
    assert.ok(streamReplyNotification);
    assert.equal(String(streamReplyNotification.user_id), String(memberUser.id));
    assert.equal(String(streamReplyNotification.metadata.actor_user_id), String(peerUser.id));

    const streamReactionNotification = streamReplyNotificationRes.body.notifications.find(
      (notification) =>
        notification?.metadata?.kind === "stream_reaction" &&
        String(notification?.metadata?.stream_post_id) === String(createdStreamPost.id)
    );
    assert.ok(streamReactionNotification);

    const exploreFeedRes = await request(app)
      .get("/api/stream/posts")
      .set(authHeader(memberToken))
      .query({ feed: "explore", limit: 10 });
    assert.equal(exploreFeedRes.status, 200);
    assert.equal(exploreFeedRes.body.success, true);
    assert.equal(exploreFeedRes.body.feed, "explore");
    assert.ok(Array.isArray(exploreFeedRes.body.posts));

    const followSuggestionsRes = await request(app)
      .get("/api/stream/suggestions")
      .set(authHeader(memberToken))
      .query({ limit: 10 });
    assert.equal(followSuggestionsRes.status, 200);
    assert.equal(followSuggestionsRes.body.success, true);
    assert.ok(Array.isArray(followSuggestionsRes.body.suggestions));
    assert.ok(
      followSuggestionsRes.body.suggestions.some(
        (suggestion) => String(suggestion.id) === String(peerUser.id)
      )
    );

    const followPeerRes = await request(app)
      .put(`/api/stream/follows/${encodeURIComponent(String(peerUser.id))}`)
      .set(authHeader(memberToken))
      .send({ follow: true });
    assert.equal(followPeerRes.status, 200);
    assert.equal(followPeerRes.body.success, true);
    assert.equal(followPeerRes.body.following, true);
    assert.equal(String(followPeerRes.body.target.user_id), String(peerUser.id));
    assert.ok(Number(followPeerRes.body.counts.viewer_following) >= 1);
    assert.ok(Number(followPeerRes.body.counts.target_followers) >= 1);

    const followSnapshotRes = await request(app)
      .get("/api/stream/follows/me")
      .set(authHeader(memberToken));
    assert.equal(followSnapshotRes.status, 200);
    assert.equal(followSnapshotRes.body.success, true);
    assert.ok(Array.isArray(followSnapshotRes.body.following));
    assert.ok(Array.isArray(followSnapshotRes.body.followers));
    assert.ok(
      followSnapshotRes.body.following.some(
        (entry) => String(entry.user_id) === String(peerUser.id)
      )
    );
    assert.ok(Number(followSnapshotRes.body.counts.following) >= 1);

    const createPeerFollowedPostRes = await request(app)
      .post("/api/stream/posts")
      .set(authHeader(peerToken))
      .send({
        title: "Peer Stream Post",
        content: "Following feed should surface this after follow.",
        excerpt: "Following feed should surface this after follow.",
        intent: "Encouragement",
        status: "published",
        metadata: { source: "e2e-follow-post" },
      });
    assert.equal(createPeerFollowedPostRes.status, 201);
    assert.equal(createPeerFollowedPostRes.body.success, true);

    const followingFeedAfterFollowRes = await request(app)
      .get("/api/stream/posts")
      .set(authHeader(memberToken))
      .query({ feed: "following", limit: 20 });
    assert.equal(followingFeedAfterFollowRes.status, 200);
    assert.equal(followingFeedAfterFollowRes.body.success, true);
    assert.equal(followingFeedAfterFollowRes.body.feed, "following");
    assert.ok(
      followingFeedAfterFollowRes.body.posts.some(
        (post) => String(post.author_user_id) === String(peerUser.id)
      )
    );

    const peerNotificationsAfterFollowRes = await request(app)
      .get("/api/notifications")
      .set(authHeader(peerToken))
      .query({ limit: 50 });
    assert.equal(peerNotificationsAfterFollowRes.status, 200);
    const streamFollowNotification = peerNotificationsAfterFollowRes.body.notifications.find(
      (notification) =>
        notification?.metadata?.kind === "stream_follow" &&
        String(notification?.metadata?.actor_user_id) === String(memberUser.id)
    );
    assert.ok(streamFollowNotification);

    const unfollowPeerRes = await request(app)
      .put(`/api/stream/follows/${encodeURIComponent(String(peerUser.id))}`)
      .set(authHeader(memberToken))
      .send({ follow: false });
    assert.equal(unfollowPeerRes.status, 200);
    assert.equal(unfollowPeerRes.body.success, true);
    assert.equal(unfollowPeerRes.body.following, false);
  });

  await t.test("chat identity key registry + participants search endpoints", async () => {
    const registerMemberKeyRes = await request(app)
      .put("/api/chat/identity-keys/me")
      .set(authHeader(memberToken))
      .send({
        keyId: "device-member-1",
        algorithm: "ECDH-P256",
        publicKeyJwk: makeDummyJwk("member"),
        deviceLabel: "Member Device",
      });
    assert.equal(registerMemberKeyRes.status, 201);
    assert.equal(registerMemberKeyRes.body.success, true);
    assert.equal(registerMemberKeyRes.body.key.key_id, "device-member-1");

    const listMyKeysRes = await request(app)
      .get("/api/chat/identity-keys/me")
      .set(authHeader(memberToken));
    assert.equal(listMyKeysRes.status, 200);
    assert.equal(listMyKeysRes.body.success, true);
    assert.ok(Array.isArray(listMyKeysRes.body.keys));
    assert.ok(
      listMyKeysRes.body.keys.some((key) => String(key.key_id) === "device-member-1")
    );

    const registerPeerKeyRes = await request(app)
      .put("/api/chat/identity-keys/me")
      .set(authHeader(peerToken))
      .send({
        key_id: "device-peer-1",
        public_key_jwk: makeDummyJwk("peer"),
        device_label: "Peer Device",
      });
    assert.equal(registerPeerKeyRes.status, 201);
    assert.equal(registerPeerKeyRes.body.success, true);

    const getPeerKeysRes = await request(app)
      .get(`/api/chat/identity-keys/${encodeURIComponent(String(peerUser.id))}`)
      .set(authHeader(memberToken));
    assert.equal(getPeerKeysRes.status, 200);
    assert.equal(getPeerKeysRes.body.success, true);
    assert.equal(String(getPeerKeysRes.body.user.id), String(peerUser.id));
    assert.ok(Array.isArray(getPeerKeysRes.body.keys));
    assert.ok(getPeerKeysRes.body.keys.length >= 1);

    const participantsRes = await request(app)
      .get("/api/chat/participants")
      .set(authHeader(memberToken))
      .query({ q: "peer-e2e", limit: 10 });
    assert.equal(participantsRes.status, 200);
    assert.equal(participantsRes.body.success, true);
    assert.ok(Array.isArray(participantsRes.body.participants));
    const peerParticipant = participantsRes.body.participants.find(
      (participant) => String(participant.id) === String(peerUser.id)
    );
    assert.ok(peerParticipant);
    assert.equal(peerParticipant.has_identity_key, true);
  });

  await t.test("chat conversations/messages endpoints (direct + group create, send, list)", async () => {
    const directConversationRes = await request(app)
      .post("/api/chat/conversations")
      .set(authHeader(memberToken))
      .send({
        type: "direct",
        name: "Member <-> Peer",
        memberIds: [String(peerUser.id)],
        memberKeyEnvelopes: [
          {
            user_id: String(memberUser.id),
            key_id: "device-member-1",
            algorithm: "ECDH-P256+A256GCM",
            encrypted_key: "enc-member-key",
            iv: "iv-member-key",
            sender_key_id: "device-member-1",
            recipient_key_id: "device-member-1",
          },
          {
            user_id: String(peerUser.id),
            key_id: "device-peer-1",
            algorithm: "ECDH-P256+A256GCM",
            encrypted_key: "enc-peer-key",
            iv: "iv-peer-key",
            sender_key_id: "device-member-1",
            recipient_key_id: "device-peer-1",
          },
        ],
        metadata: { e2ee: true, conversation_key_id: "ck-e2e-direct" },
      });

    assert.equal(directConversationRes.status, 201);
    assert.equal(directConversationRes.body.success, true);
    createdConversation = directConversationRes.body.conversation;
    assert.equal(createdConversation.type, "direct");

    const listConversationsRes = await request(app)
      .get("/api/chat/conversations")
      .set(authHeader(memberToken));
    assert.equal(listConversationsRes.status, 200);
    assert.equal(listConversationsRes.body.success, true);
    assert.ok(
      listConversationsRes.body.conversations.some(
        (conversation) => String(conversation.id) === String(createdConversation.id)
      )
    );

    const getConversationRes = await request(app)
      .get(`/api/chat/conversations/${encodeURIComponent(String(createdConversation.id))}`)
      .set(authHeader(memberToken));
    assert.equal(getConversationRes.status, 200);
    assert.equal(getConversationRes.body.success, true);
    assert.equal(String(getConversationRes.body.conversation.id), String(createdConversation.id));

    const sendMessageRes = await request(app)
      .post(`/api/chat/conversations/${encodeURIComponent(String(createdConversation.id))}/messages`)
      .set(authHeader(memberToken))
      .send({
        content_type: "text",
        algorithm: "AES-GCM-256",
        key_id: "ck-e2e-direct",
        ciphertext: "ciphertext-e2e",
        iv: "iv-e2e",
        aad: "aad-e2e",
        metadata: { e2ee: true },
      });
    assert.equal(sendMessageRes.status, 201);
    assert.equal(sendMessageRes.body.success, true);
    createdMessage = sendMessageRes.body.message;

    const listMessagesRes = await request(app)
      .get(`/api/chat/conversations/${encodeURIComponent(String(createdConversation.id))}/messages`)
      .set(authHeader(memberToken));
    assert.equal(listMessagesRes.status, 200);
    assert.equal(listMessagesRes.body.success, true);
    assert.ok(Array.isArray(listMessagesRes.body.messages));
    assert.ok(
      listMessagesRes.body.messages.some(
        (message) => String(message.id) === String(createdMessage.id)
      )
    );

    // Group conversation path smoke test (same endpoint contract, different type validation)
    const groupConversationRes = await request(app)
      .post("/api/chat/conversations")
      .set(authHeader(memberToken))
      .send({
        type: "group",
        name: "Prayer Circle E2E",
        memberIds: [String(peerUser.id), String(createdManagedUser.id)],
        memberKeyEnvelopes: [
          {
            user_id: String(memberUser.id),
            key_id: "device-member-1",
            encrypted_key: "enc-self-group",
            iv: "iv-self-group",
            algorithm: "ECDH-P256+A256GCM",
            sender_key_id: "device-member-1",
            recipient_key_id: "device-member-1",
          },
          {
            user_id: String(peerUser.id),
            key_id: "device-peer-1",
            encrypted_key: "enc-peer-group",
            iv: "iv-peer-group",
            algorithm: "ECDH-P256+A256GCM",
            sender_key_id: "device-member-1",
            recipient_key_id: "device-peer-1",
          },
          {
            user_id: String(createdManagedUser.id),
            key_id: "device-managed-1",
            encrypted_key: "enc-managed-group",
            iv: "iv-managed-group",
            algorithm: "ECDH-P256+A256GCM",
            sender_key_id: "device-member-1",
            recipient_key_id: "device-managed-1",
          },
        ],
        metadata: { e2ee: true, mode: "group" },
      });

    // Managed user has no identity key registered in this test, but backend route only validates envelope presence.
    assert.equal(groupConversationRes.status, 201);
    assert.equal(groupConversationRes.body.success, true);
    assert.equal(groupConversationRes.body.conversation.type, "group");
  });

  await t.test("forbidden access checks on protected endpoints", async () => {
    const memberCreatingUserRes = await request(app)
      .post("/api/users")
      .set(authHeader(memberToken))
      .send({
        username: "forbidden-e2e",
        email: "forbidden.e2e@ablegod.test",
      });
    assert.equal(memberCreatingUserRes.status, 403);

    const peerReadingMemberNotificationsRes = await request(app)
      .get("/api/notifications")
      .set(authHeader(peerToken))
      .query({ userId: String(memberUser.id) });
    assert.equal(peerReadingMemberNotificationsRes.status, 403);
  });
});
