const axios = require("axios");

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-haiku-20240307";

function isAnthropicModel(modelName = "") {
    return String(modelName).toLowerCase().includes("claude");
}

function resolvePreferredProviders(preferredModel = "") {
    return isAnthropicModel(preferredModel)
        ? ["anthropic", "openai"]
        : ["openai", "anthropic"];
}

function resolveOpenAiModel(preferredModel = "") {
    if (isAnthropicModel(preferredModel)) return DEFAULT_OPENAI_MODEL;
    return preferredModel || DEFAULT_OPENAI_MODEL;
}

function resolveAnthropicModel(preferredModel = "") {
    const model = String(preferredModel || "").toLowerCase();
    if (model.includes("sonnet")) return "claude-3-5-sonnet-20241022";
    if (model.includes("haiku")) return "claude-3-haiku-20240307";
    return DEFAULT_ANTHROPIC_MODEL;
}

function extractProviderErrorMessage(error) {
    return (
        error?.response?.data?.error?.message ||
        error?.response?.data?.error?.code ||
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "AI provider request failed"
    );
}

function isOpenAiQuotaOrBillingError(error) {
    const detail = String(extractProviderErrorMessage(error) || "").toLowerCase();
    return (
        detail.includes("quota") ||
        detail.includes("billing") ||
        detail.includes("insufficient_quota") ||
        detail.includes("billing_hard_limit")
    );
}

function buildFallbackImageDataUrl({ prompt, concept }) {
    const safePrompt = String(prompt || "").replace(/[<>&"]/g, " ").trim().slice(0, 180);
    const safeConcept = String(concept || "")
        .replace(/[<>&"]/g, " ")
        .trim()
        .slice(0, 120) || "Spiritual visual concept";
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="60%" stop-color="#1b1f34"/>
      <stop offset="100%" stop-color="#22142f"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect x="88" y="120" width="848" height="784" rx="56" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)"/>
  <text x="512" y="250" text-anchor="middle" fill="#d6bcfa" font-size="28" font-family="Inter,Arial,sans-serif" letter-spacing="4">ABLEGOD STREAM</text>
  <text x="140" y="350" fill="#f8fafc" font-size="40" font-family="Inter,Arial,sans-serif" font-weight="700">${safeConcept}</text>
  <foreignObject x="140" y="402" width="744" height="360">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color:#e2e8f0;font-family:Inter,Arial,sans-serif;font-size:26px;line-height:1.35;">
      ${safePrompt}
    </div>
  </foreignObject>
  <text x="140" y="862" fill="#94a3b8" font-size="20" font-family="Inter,Arial,sans-serif">Fallback visual generated while premium image provider is unavailable.</text>
</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * Service to handle AI-related tasks like content moderation,
 * writing assistance, and formatting using user-provided keys.
 */
class AIService {
    /**
     * Moderate content based on spiritual and community guidelines.
     * @param {string} content - The content to moderate.
     * @param {Object} aiSettings - User's AI settings (keys, preferred model).
     * @returns {Promise<{ is_worthy: boolean, reason?: string }>}
     */
    static async moderateContent(content, aiSettings = {}) {
        const { openai_key, anthropic_key, preferred_model = "gpt-4o-mini" } = aiSettings;
        const openaiModel = resolveOpenAiModel(preferred_model);
        const anthropicModel = resolveAnthropicModel(preferred_model);
        const providerOrder = resolvePreferredProviders(preferred_model);

        if (!openai_key && !anthropic_key) {
            // If no key is provided, we skip moderation for now or use a fallback if configured.
            // The user mentioned storing admin keys, so we could pull from a global setting.
            return { is_worthy: true };
        }

        const prompt = `
			You are a spiritual moderator for "The Stream", a community of faith. 
			Review the following post content and determine if it is spiritually worthy, constructive, and respectful to God and the community.
			
			Content to review: "${content}"
			
			Criteria:
			- No hate speech or un-Christian behavior.
			- No vulgarity.
			- Encouraging, reflective, or prayerful tone.
			- Respectful of divine principles.
			
			Respond ONLY in JSON format:
			{
				"is_worthy": boolean,
				"reason": "If not worthy, a graceful and encouraging explanation pleading with the user to act in ways that serve God. Keep it humble and compassionate."
			}
		`;

        for (const provider of providerOrder) {
            if (provider === "openai" && openai_key) {
                try {
                    const response = await axios.post(
                        "https://api.openai.com/v1/chat/completions",
                        {
                            model: openaiModel,
                            messages: [{ role: "user", content: prompt }],
                            response_format: { type: "json_object" }
                        },
                        {
                            headers: {
                                "Authorization": `Bearer ${openai_key}`,
                                "Content-Type": "application/json"
                            }
                        }
                    );
                    return JSON.parse(response.data.choices[0].message.content);
                } catch (error) {
                    console.error("OpenAI Moderation Error (Fallback triggered):", error.response?.data?.error?.message || error.message);
                    if (!anthropic_key) return { is_worthy: true };
                }
            }

            if (provider === "anthropic" && anthropic_key) {
                try {
                    const response = await axios.post(
                        "https://api.anthropic.com/v1/messages",
                        {
                            model: anthropicModel,
                            max_tokens: 1024,
                            messages: [{ role: "user", content: prompt }]
                        },
                        {
                            headers: {
                                "x-api-key": anthropic_key,
                                "anthropic-version": "2023-06-01",
                                "Content-Type": "application/json"
                            }
                        }
                    );
                    const contentStr = response.data.content[0].text;
                    const jsonMatch = contentStr.match(/\{.*\}/s);
                    return jsonMatch ? JSON.parse(jsonMatch[0]) : { is_worthy: true };
                } catch (error) {
                    console.error("Anthropic Moderation Error:", error.response?.data || error.message);
                    if (!openai_key) return { is_worthy: true };
                }
            }
        }

        return { is_worthy: true };
    }

    /**
     * Help an author with writing.
     * @param {string} prompt - The writing prompt or initial text.
     * @param {string} context - Additional context for the AI.
     * @param {Object} aiSettings - User's AI settings.
     * @returns {Promise<string>}
     */
    static async generateWritingAssistance(prompt, context, aiSettings = {}) {
        const { openai_key, anthropic_key, preferred_model = "gpt-4o-mini" } = aiSettings;
        const openaiModel = resolveOpenAiModel(preferred_model);
        const anthropicModel = resolveAnthropicModel(preferred_model);
        const providerOrder = resolvePreferredProviders(preferred_model);
        let lastError = null;
        let attemptedProvider = false;

        for (const provider of providerOrder) {
            if (provider === "openai" && openai_key) {
                attemptedProvider = true;
                try {
                    const response = await axios.post(
                        "https://api.openai.com/v1/chat/completions",
                        {
                            model: openaiModel,
                            messages: [
                                { role: "system", content: "You are a helpful writing assistant for a faith-based community. " + context },
                                { role: "user", content: prompt + "\n\nProvide a refined, more thoughtful and spiritually grounded version of the input." }
                            ]
                        },
                        {
                            headers: {
                                "Authorization": `Bearer ${openai_key}`,
                                "Content-Type": "application/json"
                            }
                        }
                    );
                    return response.data.choices[0].message.content;
                } catch (error) {
                    lastError = error;
                    console.error("OpenAI Writing Error (Fallback triggered):", error.response?.data?.error?.message || error.message);
                    if (!anthropic_key) throw error;
                }
            }

            if (provider === "anthropic" && anthropic_key) {
                attemptedProvider = true;
                try {
                    const response = await axios.post(
                        "https://api.anthropic.com/v1/messages",
                        {
                            model: anthropicModel,
                            max_tokens: 1024,
                            messages: [
                                { role: "user", content: prompt + "\n\nHelp me refine this for a faith-based community. " + context }
                            ]
                        },
                        {
                            headers: {
                                "x-api-key": anthropic_key,
                                "anthropic-version": "2023-06-01",
                                "Content-Type": "application/json"
                            }
                        }
                    );
                    return response.data.content[0].text;
                } catch (error) {
                    lastError = error;
                    console.error("Anthropic Writing Error:", error.response?.data || error.message);
                    if (!openai_key) throw error;
                }
            }
        }

        if (attemptedProvider && lastError) {
            throw new Error(
                lastError?.response?.data?.error?.message ||
                lastError?.message ||
                "AI request failed for configured providers"
            );
        }
        throw new Error("No AI keys provided");
    }

    /**
     * Generate an image using DALL-E.
     * @param {string} prompt - The image description.
     * @param {Object} aiSettings - User's AI settings.
     * @returns {Promise<string>} - The image URL.
     */
    static async generateImage(prompt, aiSettings = {}) {
        const { openai_key, anthropic_key, preferred_model = DEFAULT_OPENAI_MODEL } = aiSettings;
        let openAiError = null;

        if (openai_key) {
            try {
                const response = await axios.post(
                    "https://api.openai.com/v1/images/generations",
                    {
                        model: "dall-e-3",
                        prompt,
                        n: 1,
                        size: "1024x1024",
                        quality: "standard"
                    },
                    {
                        headers: {
                            "Authorization": `Bearer ${openai_key}`,
                            "Content-Type": "application/json"
                        }
                    }
                );

                return response.data.data[0].url;
            } catch (error) {
                openAiError = error;
                console.error("OpenAI Image Error (Fallback triggered):", extractProviderErrorMessage(error));
                if (!anthropic_key) {
                    throw new Error(extractProviderErrorMessage(error));
                }
            }
        }

        if (anthropic_key) {
            try {
                const anthropicModel = resolveAnthropicModel(preferred_model);
                const conceptResponse = await axios.post(
                    "https://api.anthropic.com/v1/messages",
                    {
                        model: anthropicModel,
                        max_tokens: 120,
                        messages: [
                            {
                                role: "user",
                                content:
                                    `Create a short spiritual visual concept title (max 8 words) for this prompt:\n${String(prompt || "").slice(0, 400)}`
                            }
                        ]
                    },
                    {
                        headers: {
                            "x-api-key": anthropic_key,
                            "anthropic-version": "2023-06-01",
                            "Content-Type": "application/json"
                        }
                    }
                );

                const concept =
                    String(conceptResponse?.data?.content?.[0]?.text || "")
                        .replace(/\s+/g, " ")
                        .trim()
                        .slice(0, 96) || "Spiritual visual concept";

                return buildFallbackImageDataUrl({ prompt, concept });
            } catch (anthropicError) {
                console.error("Anthropic Image Fallback Error:", extractProviderErrorMessage(anthropicError));
                if (openAiError) {
                    throw new Error(
                        isOpenAiQuotaOrBillingError(openAiError)
                            ? "OpenAI image quota reached and Anthropic fallback failed."
                            : extractProviderErrorMessage(openAiError)
                    );
                }
                throw new Error(extractProviderErrorMessage(anthropicError));
            }
        }

        if (openAiError) {
            throw new Error(extractProviderErrorMessage(openAiError));
        }
        throw new Error("No AI provider key available for image generation.");
    }

    /**
     * Suggest relevant Bible verses (NKJV) based on content.
     * @param {string} content - The post content.
     * @param {Object} aiSettings - User's AI settings.
     * @param {number} count - Number of suggestions to return (default: 1).
     * @returns {Promise<{ verse: string, reference: string, version: string }|Array>}
     */
    static async suggestBibleVerse(content, aiSettings = {}, count = 1) {
        const { openai_key, anthropic_key, preferred_model = "gpt-4o-mini" } = aiSettings;
        const openaiModel = resolveOpenAiModel(preferred_model);
        const anthropicModel = resolveAnthropicModel(preferred_model);
        const providerOrder = resolvePreferredProviders(preferred_model);
        let lastError = null;
        let attemptedProvider = false;

        const isMultiple = count > 1;
        const prompt = `
            You are a spiritual assistant for "The Stream". 
            Find ${isMultiple ? count : 'a relevant, encouraging, and accurate'} Bible verse${isMultiple ? 's' : ''} from the New King James Version (NKJV) that ${isMultiple ? 'back up or complement' : 'backs up or complements'} the following content.
            
            Content: "${content}"
            
            ${isMultiple ? `
            Find verses that offer different perspectives or themes related to the content.
            Avoid verses that are too similar to each other.
            ` : ''}
            
            Respond ONLY in JSON format:
            ${isMultiple ? `
            {
                "suggestions": [
                    {
                        "verse": "The full text of the verse",
                        "reference": "Book Chapter:Verse (e.g., John 3:16)",
                        "version": "NKJV"
                    }
                ]
            }
            ` : `
            {
                "verse": "The full text of the verse",
                "reference": "Book Chapter:Verse (e.g., John 3:16)",
                "version": "NKJV"
            }
            `}
        `;

        for (const provider of providerOrder) {
            if (provider === "openai" && openai_key) {
                attemptedProvider = true;
                try {
                    const response = await axios.post(
                        "https://api.openai.com/v1/chat/completions",
                        {
                            model: openaiModel,
                            messages: [{ role: "user", content: prompt }],
                            response_format: { type: "json_object" }
                        },
                        {
                            headers: {
                                "Authorization": `Bearer ${openai_key}`,
                                "Content-Type": "application/json"
                            }
                        }
                    );
                    const result = JSON.parse(response.data.choices[0].message.content);
                    return isMultiple ? result.suggestions || [result] : result;
                } catch (error) {
                    lastError = error;
                    console.error("OpenAI Suggestion Error (Fallback triggered):", error.response?.data?.error?.message || error.message);
                    if (!anthropic_key) {
                        const errorData = error.response?.data?.error;
                        const detail = errorData ? (errorData.message || errorData.code) : error.message;
                        if (detail?.includes("quota")) {
                            throw new Error("AI Assistant: OpenAI Quota exceeded and no backup available.");
                        }
                        throw new Error("Failed to find a relevant verse: " + detail);
                    }
                }
            }

            if (provider === "anthropic" && anthropic_key) {
                attemptedProvider = true;
                try {
                    const systemPrompt = `You are a spiritual assistant for "The Stream". Find relevant, encouraging, and accurate Bible verses from the New King James Version (NKJV) that back up or complement user content.`;
                    
                    const response = await axios.post(
                        "https://api.anthropic.com/v1/messages",
                        {
                            model: anthropicModel,
                            max_tokens: 1024,
                            system: [
                                {
                                    type: "text",
                                    text: systemPrompt,
                                    cache_control: {"type": "ephemeral"}
                                }
                            ],
                            messages: [{ role: "user", content: prompt }]
                        },
                        {
                            headers: {
                                "x-api-key": anthropic_key,
                                "anthropic-version": "2023-06-01",
                                "Content-Type": "application/json"
                            }
                        }
                    );
                    const contentStr = response.data.content[0].text;
                    const jsonMatch = contentStr.match(/\{.*\}/s);
                    if (jsonMatch) {
                        const result = JSON.parse(jsonMatch[0]);
                        return isMultiple ? result.suggestions || [result] : result;
                    }
                    throw new Error("Could not parse Anthropic response");
                } catch (error) {
                    lastError = error;
                    console.error("Anthropic Suggestion Error:", error.response?.data || error.message);
                    if (!openai_key) {
                        throw new Error("AI Assistant: Failed to find a relevant verse even with backup.");
                    }
                }
            }
        }

        if (attemptedProvider && lastError) {
            const detail =
                lastError?.response?.data?.error?.message ||
                lastError?.message ||
                "Failed to find relevant verse";
            throw new Error(`AI Assistant: ${detail}`);
        }
        throw new Error("No AI keys provided");
    }
}

module.exports = AIService;
