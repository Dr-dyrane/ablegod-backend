const express = require("express");
const AIService = require("../services/aiService");
const User = require("../models/user");
const { authenticate } = require("../middleware/auth");
const axios = require("axios");

const router = express.Router();

// Middleware to ensure user is authenticated and has AI settings loaded
const withAISettings = async (req, res, next) => {
    try {
        const authUser = req.auth?.user;
        if (!authUser) return res.status(401).json({ error: "Unauthorized" });

        const user = await User.findOne({ id: authUser.id });
        if (!user) return res.status(404).json({ error: "User not found" });

        // Always fetch admin settings for ultimate fallback
        const admin = await User.findOne({ role: "admin" }).sort({ createdAt: 1 });
        const adminSettings = admin?.ai_settings || {};

        // Merge user settings with admin settings. If user lacks a specific key, the admin key covers it. Fall back to process.env
        req.aiSettings = {
            openai_key: user.ai_settings?.openai_key || adminSettings.openai_key || process.env.OPENAI_API_KEY,
            anthropic_key: user.ai_settings?.anthropic_key || adminSettings.anthropic_key || process.env.ANTHROPIC_API_KEY,
            preferred_model: user.ai_settings?.preferred_model || adminSettings.preferred_model || "gpt-4o-mini"
        };

        next();
    } catch (error) {
        res.status(500).json({ error: "Failed to load AI settings" });
    }
};

// Help with writing assistance
router.post("/writing-assistant", authenticate, withAISettings, async (req, res) => {
    const { prompt, context = "" } = req.body;

    try {
        const suggestion = await AIService.generateWritingAssistance(prompt, context, req.aiSettings);
        res.json({ suggestion });
    } catch (error) {
        console.error("Writing Assistant Error:", error.response?.data || error.message);
        res.status(500).json({ error: error.message || "AI service failed to generate a suggestion." });
    }
});

// Generate images (OpenAI DALL-E)
router.post("/image-gen", authenticate, withAISettings, async (req, res) => {
    const { prompt } = req.body;

    try {
        const image_url = await AIService.generateImage(prompt, req.aiSettings);
        res.json({ image_url });
    } catch (error) {
        console.error("Image Gen Error:", error.response?.data || error.message);
        res.status(500).json({ error: error.message || "Failed to generate image." });
    }
});

// Suggest a relevant Bible verse
router.post("/bible-verse-suggestion", authenticate, withAISettings, async (req, res) => {
    const { content, count = 1 } = req.body;

    try {
        const suggestion = await AIService.suggestBibleVerse(content, req.aiSettings, count);
        res.json(suggestion);
    } catch (error) {
        console.error("Bible Suggestion Route Error:", error.response?.data || error.message);
        res.status(500).json({ error: error.message || "Failed to find a relevant verse." });
    }
});

module.exports = router;
