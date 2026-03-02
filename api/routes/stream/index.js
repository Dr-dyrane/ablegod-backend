/**
 * AbleGod Stream — Modular Route Index
 *
 * Replaces the original 1980-line stream.js monolith.
 * Each domain is now in its own file for maintainability.
 *
 * Sub-modules:
 *   _helpers.js    — Shared serializers, utilities, reaction helpers, ranking
 *   posts.js       — GET/POST/PATCH posts, feed listing (with cursor pagination)
 *   replies.js     — GET/POST/PATCH replies
 *   reactions.js   — PUT reaction (post + reply)
 *   engagement.js  — Bookmark, restream, share, view (post + reply)
 *   follows.js     — Follow snapshot, suggestions, toggle follow
 *   analytics.js   — Creator analytics snapshot for /user workspace
 *   admin.js       — Reports, audit, moderation actions, feature toggle
 */

const express = require("express");
const { requireCapabilities } = require("../../middleware/auth");

function createStreamRoutes(pusher) {
    const router = express.Router();

    // ─── Capability middleware groups ───
    const requireFeedRead = requireCapabilities("stream:read", "feed:read");
    const requirePostCreate = requireCapabilities("stream:create");
    const requirePostUpdate = requireCapabilities("stream:create");
    const requirePostInteract = requireCapabilities("stream:reply", "post:interact");
    const requireFollowRead = requireCapabilities("follow:read", "stream:read");
    const requireFollowWrite = requireCapabilities("follow:write");
    const requireStreamModerate = requireCapabilities("stream:moderate");
    const requireStreamFeature = requireCapabilities("stream:feature", "stream:moderate");

    // ─── Notification emitter (Pusher) ───
    const emitNotificationEvent = (notification) => {
        if (!pusher || !notification?.user_id) return;
        const payload = {
            id: notification.id,
            type: notification.type,
            message: notification.message,
            post_id: notification.post_id ?? null,
            post_title: notification.post_title || "",
            is_read: notification.is_read,
            created_at: notification.created_at,
            user_id: notification.user_id,
            metadata: notification.metadata || {},
        };
        pusher.trigger(`user-${notification.user_id}`, "notification:new", payload);
    };

    // ─── Shared context for all sub-modules ───
    const ctx = {
        requireFeedRead,
        requirePostCreate,
        requirePostUpdate,
        requirePostInteract,
        requireFollowRead,
        requireFollowWrite,
        requireStreamModerate,
        requireStreamFeature,
        emitNotificationEvent,
    };

    // ─── Mount sub-routes ───
    require("./posts")(router, ctx);
    require("./replies")(router, ctx);
    require("./reactions")(router, ctx);
    require("./engagement")(router, ctx);
    require("./shares")(router, ctx);
    require("./follows")(router, ctx);
    require("./analytics")(router, ctx);
    require("./circles")(router, ctx);
    require("./admin")(router, ctx);

    return router;
}

module.exports = createStreamRoutes;
