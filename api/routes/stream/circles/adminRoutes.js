const {
    StreamCircle,
    StreamCircleMember,
    StreamPost,
    StreamReport,
    resolveCircleByIdentifier,
    serializeCircle,
    toIsoNow,
} = require("./shared");

function mountAdminCircleRoutes(router, { requireStreamModerate, requireStreamFeature }) {
    // GET /admin/circles
    router.get("/admin/circles", ...requireStreamModerate, async (req, res) => {
        try {
            const limitRaw = Number.parseInt(String(req.query.limit || "80"), 10);
            const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 80;

            const circles = await StreamCircle.find({}).sort({ updated_at: -1 }).limit(limit);
            const circleIds = circles.map((circle) => String(circle.id || "")).filter(Boolean);

            const [memberCounts, postStats, circleReports] = await Promise.all([
                StreamCircleMember.aggregate([
                    { $match: { circle_id: { $in: circleIds }, status: "active" } },
                    { $group: { _id: "$circle_id", member_count: { $sum: 1 } } },
                ]),
                StreamPost.aggregate([
                    {
                        $match: {
                            "metadata.circle_id": { $in: circleIds },
                        },
                    },
                    {
                        $group: {
                            _id: "$metadata.circle_id",
                            post_count: { $sum: 1 },
                            published_post_count: {
                                $sum: {
                                    $cond: [{ $eq: ["$status", "published"] }, 1, 0],
                                },
                            },
                            pending_reports: {
                                $sum: { $ifNull: ["$metadata.report_count", 0] },
                            },
                        },
                    },
                ]),
                StreamReport.aggregate([
                    {
                        $match: {
                            target_type: "circle",
                            target_id: { $in: circleIds },
                            status: { $in: ["open", "under_review"] },
                        },
                    },
                    {
                        $group: {
                            _id: "$target_id",
                            pending_reports: { $sum: 1 },
                        },
                    },
                ]),
            ]);

            const memberCountMap = new Map(memberCounts.map((entry) => [String(entry._id || ""), Number(entry.member_count || 0)]));
            const postStatMap = new Map(postStats.map((entry) => [String(entry._id || ""), entry]));
            const circleReportMap = new Map(circleReports.map((entry) => [String(entry._id || ""), Number(entry.pending_reports || 0)]));

            const payload = circles.map((circle) => {
                const id = String(circle.id || "");
                const stat = postStatMap.get(id);
                const metadata = circle.metadata && typeof circle.metadata === "object" ? circle.metadata : {};
                return {
                    ...serializeCircle(circle, null),
                    member_count: Number(memberCountMap.get(id) ?? circle.member_count ?? 0),
                    post_count: Number(stat?.post_count ?? circle.post_count ?? 0),
                    published_post_count: Number(stat?.published_post_count || 0),
                    pending_reports: Number(stat?.pending_reports || 0) + Number(circleReportMap.get(id) || 0),
                    is_featured: Boolean(metadata.is_featured || metadata.featured),
                    editorial_boost: Number(metadata.editorial_boost || 0),
                };
            });

            return res.json({
                success: true,
                circles: payload,
                count: payload.length,
            });
        } catch (error) {
            console.error("Error listing admin stream circles:", error);
            return res.status(500).json({ success: false, message: "Failed to fetch admin circles" });
        }
    });

    // PATCH /admin/circles/:identifier/feature
    router.patch("/admin/circles/:identifier/feature", ...requireStreamFeature, async (req, res) => {
        try {
            const circle = await resolveCircleByIdentifier(req.params.identifier);
            if (!circle) return res.status(404).json({ success: false, message: "Circle not found" });

            const featured = Boolean(req.body?.featured);
            const editorialBoostRaw = req.body?.editorial_boost ?? req.body?.editorialBoost;
            const editorialBoost = Number.isFinite(Number(editorialBoostRaw))
                ? Math.max(0, Math.min(10, Number(editorialBoostRaw)))
                : 0;
            const metadata = circle.metadata && typeof circle.metadata === "object" ? { ...circle.metadata } : {};
            metadata.is_featured = featured;
            metadata.featured = featured;
            metadata.editorial_boost = featured ? editorialBoost : 0;
            metadata.featured_updated_at = toIsoNow();
            circle.metadata = metadata;
            circle.updated_at = toIsoNow();
            await circle.save();

            return res.json({
                success: true,
                circle: serializeCircle(circle, null),
            });
        } catch (error) {
            console.error("Error updating stream circle feature state:", error);
            return res.status(500).json({ success: false, message: "Failed to update circle feature state" });
        }
    });
}

module.exports = mountAdminCircleRoutes;
