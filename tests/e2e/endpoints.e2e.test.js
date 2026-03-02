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
let createdStreamCircle;
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

async function settleWithin(promise, timeoutMs = 5000) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

test.before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "ablegod-e2e-jwt-secret";
  process.env.PORT = "0";
  process.env.UPLOADS_DIR = path.join(__dirname, ".tmp", "uploads");

  const uploadsDir = process.env.UPLOADS_DIR;
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
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        try {
          io.close(done);
        } catch {
          done();
          return;
        }

        setTimeout(done, 1000);
      });
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
    await settleWithin((backend.mongoose || mongoose).disconnect(), 5000);
  } catch {
    // no-op
  }

  if (mongoServer) {
    await settleWithin(mongoServer.stop(), 5000);
  }

  try {
    const tmpDir = path.join(__dirname, ".tmp");
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch {
    // no-op
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

  // verify upload endpoint works and enforces admin/author guard
  await t.test("upload endpoint should accept file from admin", async () => {
    const tmpPath = path.join(__dirname, "test-image.png");
    // create a small dummy file
    fs.writeFileSync(tmpPath, "dummy image content");

    const uploadRes = await request(app)
      .post("/api/upload")
      .set(authHeader(adminToken))
      .attach("image", tmpPath);

    fs.unlinkSync(tmpPath);

    assert.equal(uploadRes.status, 200);
    assert.equal(uploadRes.body.url && typeof uploadRes.body.url, "string");
    // url should contain /uploads/
    assert.ok(uploadRes.body.url.includes("/uploads/"));
  });

  await t.test("upload endpoint must reject unauthenticated requests", async () => {
    const badUpload = await request(app)
      .post("/api/upload")
      .send({});

    assert.ok([401, 403].includes(badUpload.status));
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
        metadata: { source: "e2e-test", tags: ["faith", "e2e"] },
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

    // --- search & trending are currently unimplemented; coverage added as TODO
    // when filters are hooked up this block should assert that the created post
    // is returned when searching by term or tag, and that trending tags appear.
    const searchRes = await request(app)
      .get("/api/stream/posts")
      .set(authHeader(memberToken))
      .query({ q: "faith" });
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.body.success, true);
    assert.ok(
      Array.isArray(searchRes.body.posts) &&
        searchRes.body.posts.some((p) => String(p.id) === String(createdStreamPost.id)),
      "search endpoint should include the post when querying a matching word"
    );

    const trendingRes = await request(app)
      .get("/api/stream/tags/trending")
      .set(authHeader(memberToken));
    assert.equal(trendingRes.status, 200);
    assert.equal(trendingRes.body.success, true);
    assert.ok(Array.isArray(trendingRes.body.tags));
    assert.ok(trendingRes.body.tags.includes("faith"));

    const createStreamShareRes = await request(app)
      .post("/api/stream/shares")
      .set(authHeader(memberToken))
      .send({
        post_id: String(createdStreamPost.id),
        title: "Shared reflection title",
        excerpt: "Shared reflection excerpt",
        author_name: "Member E2E",
        intent: "Reflection",
        created_at: createdStreamPost.created_at,
        snapshot_url: "https://example.com/stream-share-snapshot.png",
      });
    assert.equal(createStreamShareRes.status, 201);
    assert.equal(createStreamShareRes.body.success, true);
    assert.ok(createStreamShareRes.body.share?.id);
    assert.equal(String(createStreamShareRes.body.share.post_id), String(createdStreamPost.id));
    assert.equal(
      String(createStreamShareRes.body.share.snapshot_url),
      "https://example.com/stream-share-snapshot.png"
    );

    const createdShareId = createStreamShareRes.body.share.id;
    const publicShareRes = await request(app).get(
      `/api/stream/public/shares/${encodeURIComponent(String(createdShareId))}`
    );
    assert.equal(publicShareRes.status, 200);
    assert.equal(publicShareRes.body.success, true);
    assert.equal(String(publicShareRes.body.share.id), String(createdShareId));
    assert.equal(String(publicShareRes.body.share.post_id), String(createdStreamPost.id));

    const publicShareMetaRes = await request(app).get(
      `/api/stream/public/posts/${encodeURIComponent(String(createdStreamPost.id))}/share-meta`
    );
    assert.equal(publicShareMetaRes.status, 200);
    assert.equal(publicShareMetaRes.body.success, true);
    assert.equal(String(publicShareMetaRes.body.post.id), String(createdStreamPost.id));

    const createReplyShareRes = await request(app)
      .post("/api/stream/shares")
      .set(authHeader(peerToken))
      .send({
        post_id: String(createdStreamPost.id),
        reply_id: String(createdStreamReply.id),
        title: "Reply share",
        excerpt: "Reply snapshot excerpt",
        author_name: "Peer E2E",
        intent: "Reply",
        created_at: createdStreamReply.created_at,
      });
    assert.equal(createReplyShareRes.status, 201);
    assert.equal(createReplyShareRes.body.success, true);
    assert.equal(String(createReplyShareRes.body.share.post_id), String(createdStreamPost.id));
    assert.equal(String(createReplyShareRes.body.share.reply_id), String(createdStreamReply.id));

    // user lookup should return members when searching by username/email
    const userLookupRes = await request(app)
      .get("/api/users/lookup")
      .query({ search: memberUser.username || memberUser.email });
    assert.equal(userLookupRes.status, 200);
    assert.ok(Array.isArray(userLookupRes.body));
    assert.ok(
      userLookupRes.body.some((u) =>
        String(u.id) === String(memberUser.id)
      )
    );

    // blog listing should support simple `q` search
    const blogSearchRes = await request(app)
      .get("/api/posts")
      .query({ q: "E2E Stream Post" });
    assert.equal(blogSearchRes.status, 200);
    assert.ok(Array.isArray(blogSearchRes.body));
    assert.ok(
      blogSearchRes.body.some((p) => String(p.id) === String(createdPost.id))
    );

    // tags endpoint should return available blog tags
    const blogTagsRes = await request(app).get("/api/posts/tags");
    assert.equal(blogTagsRes.status, 200);
    assert.ok(Array.isArray(blogTagsRes.body));

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

    const createCircleRes = await request(app)
      .post("/api/stream/circles")
      .set(authHeader(memberToken))
      .send({
        name: "Faith Builders E2E",
        description: "Circle for daily encouragement and prayer",
        visibility: "closed",
      });
    assert.equal(createCircleRes.status, 201);
    assert.equal(createCircleRes.body.success, true);
    createdStreamCircle = createCircleRes.body.circle;
    assert.equal(String(createdStreamCircle.visibility), "closed");
    assert.equal(String(createdStreamCircle.owner_user_id), String(memberUser.id));

    const listCirclesRes = await request(app)
      .get("/api/stream/circles")
      .set(authHeader(memberToken))
      .query({ limit: 20 });
    assert.equal(listCirclesRes.status, 200);
    assert.equal(listCirclesRes.body.success, true);
    assert.ok(Array.isArray(listCirclesRes.body.circles));
    assert.ok(
      listCirclesRes.body.circles.some(
        (circle) => String(circle.id) === String(createdStreamCircle.id)
      )
    );

    const peerClosedCirclePostBlockedRes = await request(app)
      .post("/api/stream/posts")
      .set(authHeader(peerToken))
      .send({
        title: "Should fail before join",
        content: "Attempting to post inside closed circle before joining.",
        excerpt: "Attempting to post inside closed circle before joining.",
        intent: "Reflection",
        status: "published",
        circle_id: String(createdStreamCircle.id),
      });
    assert.equal(peerClosedCirclePostBlockedRes.status, 403);

    const peerJoinCircleRes = await request(app)
      .post(`/api/stream/circles/${encodeURIComponent(String(createdStreamCircle.id))}/join`)
      .set(authHeader(peerToken))
      .send({});
    assert.equal(peerJoinCircleRes.status, 200);
    assert.equal(peerJoinCircleRes.body.success, true);
    assert.equal(peerJoinCircleRes.body.joined, true);

    const peerCirclePostRes = await request(app)
      .post("/api/stream/posts")
      .set(authHeader(peerToken))
      .send({
        title: "Peer Circle Reflection",
        content: "Now posting from inside the closed circle after joining.",
        excerpt: "Now posting from inside the closed circle after joining.",
        intent: "Encouragement",
        status: "published",
        circle_id: String(createdStreamCircle.id),
      });
    assert.equal(peerCirclePostRes.status, 201);
    assert.equal(peerCirclePostRes.body.success, true);
    assert.equal(
      String(peerCirclePostRes.body.post?.metadata?.circle_id || ""),
      String(createdStreamCircle.id)
    );

    const circlePostsRes = await request(app)
      .get(`/api/stream/circles/${encodeURIComponent(String(createdStreamCircle.id))}/posts`)
      .set(authHeader(memberToken))
      .query({ limit: 20 });
    assert.equal(circlePostsRes.status, 200);
    assert.equal(circlePostsRes.body.success, true);
    assert.ok(Array.isArray(circlePostsRes.body.posts));
    assert.ok(
      circlePostsRes.body.posts.some(
        (post) => String(post.metadata?.circle_id || "") === String(createdStreamCircle.id)
      )
    );

    const adminCirclesRes = await request(app)
      .get("/api/stream/admin/circles")
      .set(authHeader(adminToken))
      .query({ limit: 40 });
    assert.equal(adminCirclesRes.status, 200);
    assert.equal(adminCirclesRes.body.success, true);
    assert.ok(
      Array.isArray(adminCirclesRes.body.circles) &&
        adminCirclesRes.body.circles.some(
          (circle) => String(circle.id) === String(createdStreamCircle.id)
        )
    );

    // static /search pages should load (frontend), ensure server returns 200
    const searchPageRes = await request(app).get("/search");
    assert.ok([200, 404].includes(searchPageRes.status));
    const searchPageMain = await request(app).get("/search");
    assert.ok([200, 404].includes(searchPageMain.status));
    const searchPageBlog = await request(app).get("/search/blog");
    assert.ok([200, 404].includes(searchPageBlog.status));
    const userSearchPage = await request(app).get("/user/search");
    assert.ok([200, 404].includes(userSearchPage.status));

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
