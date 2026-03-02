const {
    StreamCircle,
    StreamCircleMember,
    StreamPost,
    StreamReport,
    User,
    Notification,
    serializePost,
    buildViewerReactionMap,
    buildViewerBookmarkSet,
    buildViewerRestreamSet,
    getAuthDisplayName,
} = require("../_helpers");

function normalizeVisibility(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "closed" || normalized === "secret") return normalized;
    return "public";
}

function normalizeCircleRole(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "owner" || normalized === "moderator") return normalized;
    return "member";
}

function toIsoNow() {
    return new Date().toISOString();
}

function parseBoolean(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

function createSlug(input) {
    const base = String(input || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    return base || `circle-${Math.random().toString(36).slice(2, 8)}`;
}

async function createUniqueSlug(name) {
    const base = createSlug(name);
    let candidate = base;
    let attempts = 0;

    while (attempts < 20) {
        const existing = await StreamCircle.findOne({ slug: candidate });
        if (!existing) return candidate;
        attempts += 1;
        candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }

    return `${base}-${Date.now().toString(36)}`;
}

async function resolveCircleByIdentifier(identifier) {
    const normalized = String(identifier || "").trim();
    if (!normalized) return null;
    return StreamCircle.findOne({
        $or: [{ id: normalized }, { slug: normalized }],
    });
}

async function getActiveMembership(circleId, userId) {
    const normalizedCircleId = String(circleId || "");
    const normalizedUserId = String(userId || "");
    if (!normalizedCircleId || !normalizedUserId) return null;
    return StreamCircleMember.findOne({
        circle_id: normalizedCircleId,
        user_id: normalizedUserId,
        status: "active",
    });
}

function canAccessCircle({ circle, membership, authUser }) {
    if (!circle) return false;
    if (String(authUser?.role || "").toLowerCase() === "admin") return true;
    if (String(circle.visibility || "public") === "public") return true;
    return Boolean(membership);
}

function canManageCircle({ circle, membership, authUser }) {
    if (!circle) return false;
    if (String(authUser?.role || "").toLowerCase() === "admin") return true;
    if (String(circle.owner_user_id || "") === String(authUser?.id || "")) return true;
    const membershipRole = String(membership?.role || "");
    return membershipRole === "owner" || membershipRole === "moderator";
}

function canPromoteCircleMembers({ circle, membership, authUser }) {
    if (!circle) return false;
    if (String(authUser?.role || "").toLowerCase() === "admin") return true;
    if (String(circle.owner_user_id || "") === String(authUser?.id || "")) return true;
    return String(membership?.role || "") === "owner";
}

async function resolveUserByIdentifier(identifier) {
    const normalized = String(identifier || "").trim();
    if (!normalized) return null;
    const lower = normalized.toLowerCase();
    return User.findOne({
        $or: [{ id: normalized }, { username: normalized }, { email: lower }, { email: normalized }],
    });
}

function serializeCircleMember(member) {
    return {
        id: String(member.id || ""),
        user_id: String(member.user_id || ""),
        user_name: String(member.user_name || "Member"),
        role: String(member.role || "member"),
        status: String(member.status || "active"),
        joined_at: member.joined_at || member.created_at,
        created_at: member.created_at,
        updated_at: member.updated_at,
        metadata: member.metadata && typeof member.metadata === "object" ? member.metadata : {},
    };
}

function serializeCircle(circle, membership = null) {
    return {
        id: String(circle.id || ""),
        slug: String(circle.slug || ""),
        name: String(circle.name || ""),
        description: String(circle.description || ""),
        visibility: String(circle.visibility || "public"),
        owner_user_id: String(circle.owner_user_id || ""),
        owner_name: String(circle.owner_name || ""),
        avatar_url: String(circle.avatar_url || ""),
        cover_url: String(circle.cover_url || ""),
        member_count: Number(circle.member_count || 0),
        post_count: Number(circle.post_count || 0),
        metadata: circle.metadata && typeof circle.metadata === "object" ? circle.metadata : {},
        created_at: circle.created_at,
        updated_at: circle.updated_at,
        viewer_membership: membership
            ? {
                role: String(membership.role || "member"),
                status: String(membership.status || "active"),
                joined_at: membership.joined_at || membership.created_at,
            }
            : null,
        is_member: Boolean(membership),
    };
}

async function refreshCircleStats(circleId) {
    const normalizedCircleId = String(circleId || "");
    if (!normalizedCircleId) return { member_count: 0, post_count: 0 };

    const [memberCount, postCount] = await Promise.all([
        StreamCircleMember.countDocuments({ circle_id: normalizedCircleId, status: "active" }),
        StreamPost.countDocuments({ "metadata.circle_id": normalizedCircleId }),
    ]);

    await StreamCircle.updateOne(
        { id: normalizedCircleId },
        {
            $set: {
                member_count: Number(memberCount || 0),
                post_count: Number(postCount || 0),
                updated_at: toIsoNow(),
            },
        }
    );

    return {
        member_count: Number(memberCount || 0),
        post_count: Number(postCount || 0),
    };
}

async function refreshCircleReportSummary(circleId) {
    const normalizedCircleId = String(circleId || "");
    if (!normalizedCircleId) return 0;
    const pendingCount = await StreamReport.countDocuments({
        target_type: "circle",
        target_id: normalizedCircleId,
        status: { $in: ["open", "under_review"] },
    });
    await StreamCircle.updateOne(
        { id: normalizedCircleId },
        {
            $set: {
                "metadata.report_count": Number(pendingCount || 0),
                updated_at: toIsoNow(),
            },
        }
    );
    return Number(pendingCount || 0);
}

module.exports = {
    StreamCircle,
    StreamCircleMember,
    StreamPost,
    StreamReport,
    User,
    Notification,
    serializePost,
    buildViewerReactionMap,
    buildViewerBookmarkSet,
    buildViewerRestreamSet,
    getAuthDisplayName,
    normalizeVisibility,
    normalizeCircleRole,
    toIsoNow,
    parseBoolean,
    createUniqueSlug,
    resolveCircleByIdentifier,
    getActiveMembership,
    canAccessCircle,
    canManageCircle,
    canPromoteCircleMembers,
    resolveUserByIdentifier,
    serializeCircleMember,
    serializeCircle,
    refreshCircleStats,
    refreshCircleReportSummary,
};
