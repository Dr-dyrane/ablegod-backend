const express = require("express");
const AIService = require("../services/aiService");
const User = require("../models/user");
const StreamPost = require("../models/streamPost");
const { authenticate } = require("../middleware/auth");
const axios = require("axios");
const { v2: cloudinary } = require("cloudinary");

const router = express.Router();

const DEFAULT_AI_SETTINGS = {
    openai_key: "",
    anthropic_key: "",
    preferred_model: "gpt-4o-mini",
    enable_writing_assistant: true,
    enable_bible_suggestions: true,
    enable_content_moderation: false,
};

const resolveProviderOrder = (preferredModel = "") =>
    String(preferredModel || "").toLowerCase().includes("claude")
        ? ["anthropic", "openai"]
        : ["openai", "anthropic"];

const normalizeAiSettings = (raw = {}) => ({
    ...DEFAULT_AI_SETTINGS,
    ...raw,
    openai_key: String(raw.openai_key || "").trim(),
    anthropic_key: String(raw.anthropic_key || "").trim(),
    preferred_model: String(raw.preferred_model || DEFAULT_AI_SETTINGS.preferred_model),
    enable_writing_assistant: raw.enable_writing_assistant !== false,
    enable_bible_suggestions: raw.enable_bible_suggestions !== false,
    enable_content_moderation: Boolean(raw.enable_content_moderation),
});

const sanitizeForResponse = (settings) => ({
    ...settings,
    openai_key: settings.openai_key || "",
    anthropic_key: settings.anthropic_key || "",
});

const getAdminAiSettings = async () => {
    const adminWithProviderKeys = await User.findOne({
        role: "admin",
        $or: [
            { "ai_settings.openai_key": { $exists: true, $nin: ["", null] } },
            { "ai_settings.anthropic_key": { $exists: true, $nin: ["", null] } },
        ],
    }).sort({ createdAt: 1, lastLogin: -1 });
    const admin = adminWithProviderKeys || (await User.findOne({ role: "admin" }).sort({ createdAt: 1 }));
    return normalizeAiSettings(admin?.ai_settings || {});
};

const buildEffectiveSettings = (userSettings, adminSettings) => {
    const merged = normalizeAiSettings({
        ...adminSettings,
        ...userSettings,
        openai_key: userSettings.openai_key || adminSettings.openai_key || process.env.OPENAI_API_KEY || "",
        anthropic_key: userSettings.anthropic_key || adminSettings.anthropic_key || process.env.ANTHROPIC_API_KEY || "",
        preferred_model: userSettings.preferred_model || adminSettings.preferred_model || DEFAULT_AI_SETTINGS.preferred_model,
    });

    return {
        ...merged,
        provider_order: resolveProviderOrder(merged.preferred_model),
    };
};

// Middleware to ensure user is authenticated and has AI settings loaded
const withAISettings = async (req, res, next) => {
    try {
        const authUser = req.auth?.user;
        if (!authUser) return res.status(401).json({ error: "Unauthorized" });
        const authUserId = String(authUser.id || "");
        const authUserIdNumeric = Number(authUserId);
        const user =
            authUser ||
            (await User.findOne({
                $or: [
                    { id: authUserId },
                    ...(Number.isFinite(authUserIdNumeric) ? [{ id: authUserIdNumeric }] : []),
                ],
            }));
        if (!user) return res.status(404).json({ error: "User not found" });

        const userSettings = normalizeAiSettings(user.ai_settings || {});
        const adminSettings = await getAdminAiSettings();
        req.aiSettings = buildEffectiveSettings(userSettings, adminSettings);
        req.userAiSettings = userSettings;
        req.adminAiSettings = adminSettings;
        req.dbUser = user;

        next();
    } catch (error) {
        res.status(500).json({ error: "Failed to load AI settings" });
    }
};

router.get("/settings", authenticate, withAISettings, async (req, res) => {
    const settings = sanitizeForResponse(req.userAiSettings || DEFAULT_AI_SETTINGS);
    const effective = sanitizeForResponse(req.aiSettings || DEFAULT_AI_SETTINGS);
    return res.json({
        success: true,
        settings,
        effective_settings: effective,
        status: {
            has_openai_key: Boolean(effective.openai_key),
            has_anthropic_key: Boolean(effective.anthropic_key),
            provider_order: effective.provider_order || resolveProviderOrder(effective.preferred_model),
        },
    });
});

router.put("/settings", authenticate, withAISettings, async (req, res) => {
    try {
        const incoming = req.body && typeof req.body === "object" ? req.body : {};
        const current = normalizeAiSettings(req.dbUser?.ai_settings || {});
        const nextSettings = normalizeAiSettings({
            ...current,
            ...incoming,
            openai_key:
                Object.prototype.hasOwnProperty.call(incoming, "openai_key")
                    ? incoming.openai_key
                    : current.openai_key,
            anthropic_key:
                Object.prototype.hasOwnProperty.call(incoming, "anthropic_key")
                    ? incoming.anthropic_key
                    : current.anthropic_key,
            preferred_model:
                Object.prototype.hasOwnProperty.call(incoming, "preferred_model")
                    ? incoming.preferred_model
                    : current.preferred_model,
            enable_writing_assistant:
                Object.prototype.hasOwnProperty.call(incoming, "enable_writing_assistant")
                    ? incoming.enable_writing_assistant
                    : current.enable_writing_assistant,
            enable_bible_suggestions:
                Object.prototype.hasOwnProperty.call(incoming, "enable_bible_suggestions")
                    ? incoming.enable_bible_suggestions
                    : current.enable_bible_suggestions,
            enable_content_moderation:
                Object.prototype.hasOwnProperty.call(incoming, "enable_content_moderation")
                    ? incoming.enable_content_moderation
                    : current.enable_content_moderation,
        });
        const user = req.dbUser;
        user.ai_settings = nextSettings;
        await user.save();

        return res.json({
            success: true,
            message: "AI settings updated",
            settings: sanitizeForResponse(nextSettings),
        });
    } catch (error) {
        console.error("AI settings update error:", error);
        return res.status(500).json({ success: false, error: "Failed to update AI settings" });
    }
});

router.post("/test-connection", authenticate, withAISettings, async (req, res) => {
    const provider = String(req.body?.provider || "").toLowerCase();
    const preferredModel = String(req.body?.model || req.aiSettings?.preferred_model || "gpt-4o-mini");
    const openaiKey = String(req.body?.openai_key || req.body?.key || req.aiSettings?.openai_key || "").trim();
    const anthropicKey = String(req.body?.anthropic_key || req.body?.key || req.aiSettings?.anthropic_key || "").trim();

    if (!["openai", "anthropic"].includes(provider)) {
        return res.status(400).json({ success: false, error: "Invalid provider" });
    }

    try {
        const start = Date.now();
        if (provider === "openai") {
            if (!openaiKey) return res.status(400).json({ success: false, error: "OpenAI key missing" });
            await axios.get("https://api.openai.com/v1/models", {
                headers: {
                    Authorization: `Bearer ${openaiKey}`,
                    "Content-Type": "application/json",
                },
                timeout: 12000,
            });
        }

        if (provider === "anthropic") {
            if (!anthropicKey) return res.status(400).json({ success: false, error: "Anthropic key missing" });
            await axios.post(
                "https://api.anthropic.com/v1/messages",
                {
                    model: preferredModel.toLowerCase().includes("sonnet")
                        ? "claude-3-5-sonnet-20241022"
                        : "claude-3-haiku-20240307",
                    max_tokens: 1,
                    messages: [{ role: "user", content: "Connection test." }],
                },
                {
                    headers: {
                        "x-api-key": anthropicKey,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    timeout: 12000,
                }
            );
        }

        return res.json({
            success: true,
            provider,
            latency_ms: Date.now() - start,
            message: `${provider} connection is healthy`,
        });
    } catch (error) {
        const detail =
            error?.response?.data?.error?.message ||
            error?.response?.data?.error ||
            error?.response?.data?.message ||
            error?.message ||
            "Connection test failed";
        return res.status(502).json({ success: false, provider, error: detail });
    }
});

router.get("/analytics", authenticate, withAISettings, async (req, res) => {
    try {
        if (String(req.auth?.user?.role || "").toLowerCase() !== "admin") {
            return res.status(403).json({ success: false, error: "Admin access required" });
        }

        const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [
            usersWithOpenAI,
            usersWithAnthropic,
            usersWithBoth,
            adminsWithKeys,
            streamPosts30d,
            moderationQueue30d,
        ] = await Promise.all([
            User.countDocuments({ "ai_settings.openai_key": { $exists: true, $nin: ["", null] } }),
            User.countDocuments({ "ai_settings.anthropic_key": { $exists: true, $nin: ["", null] } }),
            User.countDocuments({
                "ai_settings.openai_key": { $exists: true, $nin: ["", null] },
                "ai_settings.anthropic_key": { $exists: true, $nin: ["", null] },
            }),
            User.countDocuments({
                role: "admin",
                $or: [
                    { "ai_settings.openai_key": { $exists: true, $nin: ["", null] } },
                    { "ai_settings.anthropic_key": { $exists: true, $nin: ["", null] } },
                ],
            }),
            StreamPost.countDocuments({
                status: "published",
                created_at: { $gte: thirtyDaysAgoIso },
            }),
            StreamPost.countDocuments({
                status: "published",
                created_at: { $gte: thirtyDaysAgoIso },
                $or: [
                    { "metadata.moderation_status": "review" },
                    { "metadata.moderation_status": "restricted" },
                    { "metadata.moderation_status": "blocked" },
                ],
            }),
        ]);

        return res.json({
            success: true,
            analytics: {
                generated_at: new Date().toISOString(),
                providers: {
                    openai_configured_users: usersWithOpenAI,
                    anthropic_configured_users: usersWithAnthropic,
                    dual_configured_users: usersWithBoth,
                    anthropic_only_users: Math.max(0, usersWithAnthropic - usersWithBoth),
                    openai_only_users: Math.max(0, usersWithOpenAI - usersWithBoth),
                    admins_with_any_provider: adminsWithKeys,
                    preferred_provider_order: req.aiSettings?.provider_order || resolveProviderOrder(req.aiSettings?.preferred_model),
                },
                stream: {
                    published_posts_last_30d: streamPosts30d,
                    moderation_queue_last_30d: moderationQueue30d,
                },
            },
        });
    } catch (error) {
        console.error("AI analytics error:", error);
        return res.status(500).json({ success: false, error: "Failed to load AI analytics" });
    }
});

// Help with writing assistance
router.post("/writing-assistant", authenticate, withAISettings, async (req, res) => {
    const { prompt, context = "" } = req.body;

    try {
        if (req.aiSettings?.enable_writing_assistant === false) {
            return res.status(403).json({ error: "Writing assistant is disabled" });
        }
        const suggestion = await AIService.generateWritingAssistance(prompt, context, req.aiSettings);
        res.json({
            suggestion,
            provider_order: req.aiSettings?.provider_order || resolveProviderOrder(req.aiSettings?.preferred_model),
            preferred_model: req.aiSettings?.preferred_model || DEFAULT_AI_SETTINGS.preferred_model,
        });
    } catch (error) {
        console.error("Writing Assistant Error:", error.response?.data || error.message);
        res.status(500).json({ error: error.message || "AI service failed to generate a suggestion." });
    }
});

// Generate images (OpenAI DALL-E → uploaded to Cloudinary)
router.post("/image-gen", authenticate, withAISettings, async (req, res) => {
    // Accept either a raw prompt OR structured content context
    const rawPrompt = String(req.body?.prompt || "").trim();
    const content = String(req.body?.content || "").trim();
    const intent = String(req.body?.intent || "Reflection").trim();
    const title = String(req.body?.title || "").trim();

    // Build a photographic/cinematic scene prompt — no text, no quote cards
    let finalPrompt;
    if (content || title) {
        const scene = (title || content).slice(0, 220);
        const intentLower = intent.toLowerCase();
        const mood =
            intentLower === "prayer" ? "peaceful, reverent, cinematic prayer atmosphere" :
                intentLower === "testimony" ? "joyful, triumphant, warm light, life transformation" :
                    intentLower === "reflection" ? "contemplative, tranquil, spiritual depth" :
                        intentLower === "question" ? "thoughtful, searching, morning light, open horizon" :
                            intentLower === "encouragement" ? "uplifting, hopeful, golden light, community" :
                                "spiritual, serene, cinematic";
        finalPrompt = [
            `A photorealistic artistic photograph or cinematic painting illustrating the theme: "${scene}".`,
            `Mood: ${mood}.`,
            "Style: professional photography, natural lighting, rich colours, faith atmosphere.",
            "No text, no words, no captions, no banners, no overlays.",
        ].join(" ");
    } else if (rawPrompt) {
        // Strip any prompt that already contains quote/banner language
        const sanitised = rawPrompt
            .replace(/quote\s*card|banner|text\s*overlay|overlay/gi, "scene")
            .slice(0, 400);
        finalPrompt = `${sanitised}. No text, no words, no overlays, photorealistic cinematic style.`;
    } else {
        return res.status(400).json({ success: false, error: "prompt, content, or title is required" });
    }

    try {
        // Step 1: Generate image URL from DALL-E (or SVG fallback)
        const rawResult = await AIService.generateImage(finalPrompt, req.aiSettings);

        // Step 2: If it's a data: URL (SVG fallback), return preview-only — do NOT store as post image
        if (String(rawResult || "").startsWith("data:")) {
            return res.json({
                image_url: null,           // never embed data: URLs in posts
                fallback_preview: rawResult, // for in-composer preview only
                is_fallback: true,
                message: "AI image provider unavailable. Preview shown but not attached to post.",
            });
        }

        // Step 3: Upload the DALL-E URL to Cloudinary so we own the permanent URL
        let cloudinaryUrl = null;
        try {
            const cloudinaryUrlStr = process.env.CLOUDINARY_URL || "";
            const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
            const apiKey = process.env.CLOUDINARY_API_KEY || "";
            const apiSecret = process.env.CLOUDINARY_API_SECRET || "";
            const isConfigured = !!(cloudinaryUrlStr || (cloudName && apiKey && apiSecret));

            if (isConfigured) {
                if (cloudinaryUrlStr) {
                    cloudinary.config({ cloudinary_url: cloudinaryUrlStr });
                } else {
                    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
                }
                const uploadResult = await cloudinary.uploader.upload(rawResult, {
                    folder: "ablegod/ai-generated",
                    resource_type: "image",
                    overwrite: false,
                    timeout: 25000,
                });
                cloudinaryUrl = uploadResult?.secure_url || null;
            }
        } catch (uploadErr) {
            console.error("Cloudinary upload of AI image failed:", uploadErr?.message || uploadErr);
            // Return DALL-E URL as fallback if Cloudinary fails — better than nothing
            // Frontend will show it but warn the user it may expire
            return res.json({
                image_url: rawResult,
                cloudinary_url: null,
                is_temporary: true,
                message: "Image generated but could not be permanently stored. URL may expire.",
            });
        }

        return res.json({
            image_url: cloudinaryUrl || rawResult,
            cloudinary_url: cloudinaryUrl,
            is_temporary: !cloudinaryUrl,
        });
    } catch (error) {
        console.error("Image Gen Error:", error.response?.data || error.message);
        res.status(500).json({ error: error.message || "Failed to generate image." });
    }
});

// Suggest a relevant Bible verse
router.post("/bible-verse-suggestion", authenticate, withAISettings, async (req, res) => {
    const { content, count = 1 } = req.body;

    try {
        if (req.aiSettings?.enable_bible_suggestions === false) {
            return res.status(403).json({ error: "Bible suggestions are disabled" });
        }
        const suggestion = await AIService.suggestBibleVerse(content, req.aiSettings, count);
        res.json(suggestion);
    } catch (error) {
        console.error("Bible Suggestion Route Error:", error.response?.data || error.message);
        res.status(500).json({ error: error.message || "Failed to find a relevant verse." });
    }
});

module.exports = router;
