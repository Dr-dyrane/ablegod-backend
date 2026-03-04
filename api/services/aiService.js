const axios = require("axios");

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-haiku-20240307";

// Pollinations.ai — free, keyless, real-image fallback for image generation
// Docs: https://pollinations.ai  — uses Flux/SDXL internally
const POLLINATIONS_IMAGE_URL = "https://image.pollinations.ai/prompt";

// Per-provider request timeouts (ms)
const TIMEOUT_DALLE = 45_000;   // DALL-E can be slow on cold start
const TIMEOUT_POLLINATIONS = 30_000;
const TIMEOUT_TEXT_AI = 20_000;   // Writing / bible verse / moderation

// ─────────────────────────────────────────────────────────────────────────────
// Static Bible verse fallbacks — used when ALL AI providers fail.
// Keeps the UX alive without throwing. Keyed by lowercase intent keyword.
// ─────────────────────────────────────────────────────────────────────────────

const STATIC_VERSES_BY_INTENT = {
    prayer: [
        { verse: "The effective, fervent prayer of a righteous man avails much.", reference: "James 5:16", version: "NKJV" },
        { verse: "Call to Me, and I will answer you, and show you great and mighty things, which you do not know.", reference: "Jeremiah 33:3", version: "NKJV" },
        { verse: "Pray without ceasing.", reference: "1 Thessalonians 5:17", version: "NKJV" }
    ],
    reflection: [
        { verse: "Be still, and know that I am God; I will be exalted among the nations.", reference: "Psalm 46:10", version: "NKJV" },
        { verse: "Search me, O God, and know my heart; try me, and know my anxieties.", reference: "Psalm 139:23", version: "NKJV" },
        { verse: "Thy word is a lamp unto my feet, and a light unto my path.", reference: "Psalm 119:105", version: "NKJV" }
    ],
    encouragement: [
        { verse: "I can do all things through Christ who strengthens me.", reference: "Philippians 4:13", version: "NKJV" },
        { verse: "The Lord is my shepherd; I shall not want.", reference: "Psalm 23:1", version: "NKJV" },
        { verse: "But those who wait on the Lord shall renew their strength; they shall mount up with wings like eagles.", reference: "Isaiah 40:31", version: "NKJV" }
    ],
    testimony: [
        { verse: "And they overcame him by the blood of the Lamb and by the word of their testimony.", reference: "Revelation 12:11", version: "NKJV" },
        { verse: "Oh, taste and see that the Lord is good; Blessed is the man who trusts in Him!", reference: "Psalm 34:8", version: "NKJV" }
    ],
    question: [
        { verse: "Trust in the Lord with all your heart, and lean not on your own understanding.", reference: "Proverbs 3:5", version: "NKJV" },
        { verse: "If any of you lacks wisdom, let him ask of God, who gives to all liberally and without reproach.", reference: "James 1:5", version: "NKJV" }
    ],
    default: [
        { verse: "For God so loved the world that He gave His only begotten Son, that whoever believes in Him should not perish but have everlasting life.", reference: "John 3:16", version: "NKJV" },
        { verse: "I am the way, the truth, and the life. No one comes to the Father except through Me.", reference: "John 14:6", version: "NKJV" },
        { verse: "Let everything that has breath praise the Lord. Praise the Lord!", reference: "Psalm 150:6", version: "NKJV" }
    ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function isQuotaOrBillingError(error) {
    const detail = String(extractProviderErrorMessage(error) || "").toLowerCase();
    return (
        detail.includes("quota") ||
        detail.includes("billing") ||
        detail.includes("insufficient_quota") ||
        detail.includes("billing_hard_limit") ||
        detail.includes("rate_limit") ||
        detail.includes("too many requests") ||
        (error?.response?.status === 429)
    );
}

function isNetworkError(error) {
    return (
        error?.code === "ECONNABORTED" ||
        error?.code === "ETIMEDOUT" ||
        error?.code === "ECONNRESET" ||
        error?.code === "ENOTFOUND" ||
        String(error?.message || "").toLowerCase().includes("timeout")
    );
}

/**
 * Wraps a promise with a timeout.
 * @param {Promise} promise
 * @param {number} ms
 * @param {string} label - for logging
 */
function withTimeout(promise, ms, label = "AI request") {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(Object.assign(new Error(`${label} timed out after ${ms}ms`), { code: "ETIMEDOUT" }));
        }, ms);
        promise.then(
            (val) => { clearTimeout(timer); resolve(val); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
}

/**
 * Extracts a content intent keyword from free-form content.
 * Used to pick the best static verse fallback.
 */
function detectIntent(content = "") {
    const lower = String(content || "").toLowerCase();
    if (lower.includes("pray") || lower.includes("worship") || lower.includes("intercede")) return "prayer";
    if (lower.includes("testif") || lower.includes("miracle") || lower.includes("healed") || lower.includes("delivered")) return "testimony";
    if (lower.includes("encour") || lower.includes("hope") || lower.includes("strong") || lower.includes("persevere")) return "encouragement";
    if (lower.includes("reflect") || lower.includes("still") || lower.includes("peace") || lower.includes("meditat")) return "reflection";
    if (lower.includes("question") || lower.includes("wonder") || lower.includes("why") || lower.includes("doubt")) return "question";
    return "default";
}

/**
 * Returns the best-fit static verse for the given content.
 */
function getStaticVerseFallback(content = "", count = 1) {
    const intent = detectIntent(content);
    const options = STATIC_VERSES_BY_INTENT[intent] || STATIC_VERSES_BY_INTENT.default;

    // Pick a random primary
    const randomIndex = Math.floor(Math.random() * options.length);
    const primary = options[randomIndex];

    if (count <= 1) return { ...primary, _fallback: true };

    // For multiple, return primary + one random from default (ensuring it's different if possible)
    const defaultOptions = STATIC_VERSES_BY_INTENT.default;
    const secondary = defaultOptions[Math.floor(Math.random() * defaultOptions.length)];

    // If we happened to pick the same, try one from encouragement
    let finalSecondary = secondary;
    if (secondary.verse === primary.verse) {
        finalSecondary = STATIC_VERSES_BY_INTENT.encouragement[0];
    }

    const suggestions = [primary, finalSecondary];
    return { suggestions: suggestions.slice(0, count).map((v) => ({ ...v, _fallback: true })), _fallback: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Image generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tier 1: OpenAI DALL-E 3
 * Returns a temporary DALL-E URL string or throws.
 */
async function generateImageViaDalle(prompt, openaiKey) {
    const response = await withTimeout(
        axios.post(
            "https://api.openai.com/v1/images/generations",
            {
                model: "dall-e-3",
                prompt,
                n: 1,
                size: "1024x1024",
                quality: "standard",
            },
            {
                headers: {
                    Authorization: `Bearer ${openaiKey}`,
                    "Content-Type": "application/json",
                },
                timeout: TIMEOUT_DALLE,
            }
        ),
        TIMEOUT_DALLE,
        "DALL-E 3"
    );
    const url = response.data?.data?.[0]?.url;
    if (!url) throw new Error("DALL-E returned no image URL");
    return url;
}

/**
 * Tier 2: Pollinations.ai — free, keyless, real-photo/art fallback.
 * Returns a Buffer of the raw image bytes.
 */
async function generateImageViaPollinations(prompt) {
    const encoded = encodeURIComponent(
        String(prompt || "")
            .replace(/["]/g, "'")   // some special chars cause issues
            .slice(0, 400)
    );
    const url = `${POLLINATIONS_IMAGE_URL}/${encoded}?width=1024&height=1024&nologo=true&enhance=true`;

    const response = await withTimeout(
        axios.get(url, {
            responseType: "arraybuffer",
            timeout: TIMEOUT_POLLINATIONS,
            headers: {
                "User-Agent": "AbleGod-Stream/1.0",
                "Accept": "image/jpeg,image/png,image/*",
            },
        }),
        TIMEOUT_POLLINATIONS,
        "Pollinations.ai"
    );

    const contentType = String(response.headers?.["content-type"] || "image/jpeg");
    if (!contentType.startsWith("image/")) {
        throw new Error(`Pollinations returned non-image content: ${contentType}`);
    }

    return { buffer: Buffer.from(response.data), contentType };
}

// ─────────────────────────────────────────────────────────────────────────────
// AIService class
// ─────────────────────────────────────────────────────────────────────────────

class AIService {

    // ─── Content Moderation ──────────────────────────────────────────────────

    /**
     * Moderate content based on spiritual and community guidelines.
     * SAFE DEFAULT: if all providers fail, returns is_worthy: true (never block posts silently).
     */
    static async moderateContent(content, aiSettings = {}) {
        const { openai_key, anthropic_key, preferred_model = "gpt-4o-mini" } = aiSettings;
        const openaiModel = resolveOpenAiModel(preferred_model);
        const anthropicModel = resolveAnthropicModel(preferred_model);
        const providerOrder = resolvePreferredProviders(preferred_model);

        // No keys → permissive default (moderation is optional feature)
        if (!openai_key && !anthropic_key) return { is_worthy: true };

        const prompt = `
            You are a spiritual moderator for "The Stream", a community of faith.
            Review the following post content and determine if it is spiritually worthy, constructive, and respectful to God and the community.

            Content to review: "${String(content || "").slice(0, 1000)}"

            Criteria:
            - No hate speech or un-Christian behavior.
            - No vulgarity.
            - Encouraging, reflective, or prayerful tone.
            - Respectful of divine principles.

            Respond ONLY in JSON format:
            {
                "is_worthy": boolean,
                "reason": "If not worthy, a graceful and encouraging explanation. Keep it humble and compassionate."
            }
        `;

        for (const provider of providerOrder) {
            if (provider === "openai" && openai_key) {
                try {
                    const response = await withTimeout(
                        axios.post(
                            "https://api.openai.com/v1/chat/completions",
                            {
                                model: openaiModel,
                                messages: [{ role: "user", content: prompt }],
                                response_format: { type: "json_object" },
                            },
                            {
                                headers: {
                                    Authorization: `Bearer ${openai_key}`,
                                    "Content-Type": "application/json",
                                },
                                timeout: TIMEOUT_TEXT_AI,
                            }
                        ),
                        TIMEOUT_TEXT_AI,
                        "OpenAI moderation"
                    );
                    return JSON.parse(response.data.choices[0].message.content);
                } catch (error) {
                    console.error("OpenAI Moderation error:", extractProviderErrorMessage(error));
                    if (!anthropic_key) return { is_worthy: true }; // permissive fallback
                }
            }

            if (provider === "anthropic" && anthropic_key) {
                try {
                    const response = await withTimeout(
                        axios.post(
                            "https://api.anthropic.com/v1/messages",
                            {
                                model: anthropicModel,
                                max_tokens: 512,
                                messages: [{ role: "user", content: prompt }],
                            },
                            {
                                headers: {
                                    "x-api-key": anthropic_key,
                                    "anthropic-version": "2023-06-01",
                                    "Content-Type": "application/json",
                                },
                                timeout: TIMEOUT_TEXT_AI,
                            }
                        ),
                        TIMEOUT_TEXT_AI,
                        "Anthropic moderation"
                    );
                    const text = response.data.content[0].text;
                    const jsonMatch = text.match(/\{.*\}/s);
                    return jsonMatch ? JSON.parse(jsonMatch[0]) : { is_worthy: true };
                } catch (error) {
                    console.error("Anthropic Moderation error:", extractProviderErrorMessage(error));
                }
            }
        }

        // All providers failed — permissive default
        console.warn("All moderation providers failed. Defaulting to is_worthy: true.");
        return { is_worthy: true };
    }

    // ─── Writing Assistant ───────────────────────────────────────────────────

    /**
     * Generate writing assistance.
     * Returns { suggestion: string, no_provider?: boolean }
     */
    static async generateWritingAssistance(prompt, context, aiSettings = {}) {
        const { openai_key, anthropic_key, preferred_model = DEFAULT_OPENAI_MODEL } = aiSettings;
        const openaiModel = resolveOpenAiModel(preferred_model);
        const anthropicModel = resolveAnthropicModel(preferred_model);
        const providerOrder = resolvePreferredProviders(preferred_model);

        // No keys — signal to route so frontend can degrade gracefully
        if (!openai_key && !anthropic_key) {
            return { no_provider: true, suggestion: null };
        }

        let lastError = null;

        for (const provider of providerOrder) {
            if (provider === "openai" && openai_key) {
                // Skip immediately on quota — don't waste time waiting for timeout
                try {
                    const response = await withTimeout(
                        axios.post(
                            "https://api.openai.com/v1/chat/completions",
                            {
                                model: openaiModel,
                                messages: [
                                    {
                                        role: "system",
                                        content:
                                            "You are a helpful writing assistant for a faith-based community. " +
                                            String(context || ""),
                                    },
                                    {
                                        role: "user",
                                        content:
                                            prompt +
                                            "\n\nProvide a refined, spiritually grounded version of the input.",
                                    },
                                ],
                            },
                            {
                                headers: {
                                    Authorization: `Bearer ${openai_key}`,
                                    "Content-Type": "application/json",
                                },
                                timeout: TIMEOUT_TEXT_AI,
                            }
                        ),
                        TIMEOUT_TEXT_AI,
                        "OpenAI writing"
                    );
                    return { suggestion: response.data.choices[0].message.content };
                } catch (error) {
                    lastError = error;
                    const isQuota = isQuotaOrBillingError(error);
                    const isNet = isNetworkError(error);
                    console.error(
                        `OpenAI Writing ${isQuota ? "[QUOTA]" : isNet ? "[NETWORK]" : "[ERROR]"}:`,
                        extractProviderErrorMessage(error)
                    );
                    if (!anthropic_key) throw new Error(extractProviderErrorMessage(error));
                    // continue to anthropic
                }
            }

            if (provider === "anthropic" && anthropic_key) {
                try {
                    const response = await withTimeout(
                        axios.post(
                            "https://api.anthropic.com/v1/messages",
                            {
                                model: anthropicModel,
                                max_tokens: 1024,
                                messages: [
                                    {
                                        role: "user",
                                        content:
                                            prompt +
                                            "\n\nHelp me refine this for a faith-based community. " +
                                            String(context || ""),
                                    },
                                ],
                            },
                            {
                                headers: {
                                    "x-api-key": anthropic_key,
                                    "anthropic-version": "2023-06-01",
                                    "Content-Type": "application/json",
                                },
                                timeout: TIMEOUT_TEXT_AI,
                            }
                        ),
                        TIMEOUT_TEXT_AI,
                        "Anthropic writing"
                    );
                    return { suggestion: response.data.content[0].text };
                } catch (error) {
                    lastError = error;
                    console.error("Anthropic Writing error:", extractProviderErrorMessage(error));
                    if (!openai_key) throw new Error(extractProviderErrorMessage(error));
                }
            }
        }

        throw new Error(
            extractProviderErrorMessage(lastError) ||
            "All AI writing providers failed"
        );
    }

    // ─── Image Generation ────────────────────────────────────────────────────

    /**
     * Generate an image.
     *
     * Returns: { url: string, source: "dalle"|"pollinations", is_temporary: boolean }
     * - url:          direct image URL (DALL-E) or Pollinationsai URL
     *                 NOTE: caller is responsible for uploading to Cloudinary
     * - source:       which provider generated it
     * - is_temporary: true when url is a DALL-E URL (expires ~1h)
     *
     * FALLBACK CHAIN:
     *   1. DALL-E 3 (if openai_key available)
     *   2. Pollinations.ai (free, keyless) — always available
     *
     * Anthropic has NO image generation API. When only Anthropic key is
     * configured, we skip straight to Pollinations tier.
     *
     * Throws only if Pollinations also fails (extremely rare).
     */
    static async generateImage(prompt, aiSettings = {}) {
        const { openai_key } = aiSettings;
        const safePrompt = String(prompt || "").trim();

        let dalleError = null;

        // ── Tier 1: OpenAI DALL-E 3 ──────────────────────────────────────
        // Priority: try DALL-E if key exists, as it provides the highest quality
        if (openai_key && openai_key.startsWith("sk-")) {
            try {
                console.info("Image generation: Attempting DALL-E 3...");
                const url = await generateImageViaDalle(safePrompt, openai_key);
                return { url, source: "dalle", is_temporary: true };
            } catch (error) {
                dalleError = error;
                const label = isQuotaOrBillingError(error) ? "[QUOTA]" : isNetworkError(error) ? "[TIMEOUT]" : "[ERROR]";
                console.warn(`DALL-E 3 fallback triggered ${label}:`, extractProviderErrorMessage(error));
            }
        }

        // ── Tier 2: Community Backup (Pollinations.ai) ───────────────────
        // Fallback: Pollinations is keyless and highly reliable.
        try {
            console.info("Image generation: Falling back to Pollinations.ai (Keyless Backup)");
            const { buffer, contentType } = await generateImageViaPollinations(safePrompt);
            return {
                url: null,
                buffer,
                contentType,
                source: "pollinations",
                is_temporary: false,
                _is_backup: true
            };
        } catch (pollinationsError) {
            console.error("Critical: All image providers failed.", extractProviderErrorMessage(pollinationsError));

            // Build the most helpful diagnostic message
            let errMsg = "All image generation services are currently unavailable.";
            if (dalleError && isQuotaOrBillingError(dalleError)) {
                errMsg = "OpenAI image quota reached, and community backup failed.";
            } else if (!openai_key) {
                errMsg = "No OpenAI key provided, and community backup failed.";
            }

            throw new Error(`${errMsg} Details: ${extractProviderErrorMessage(pollinationsError)}`);
        }
    }

    // ─── Bible Verse Suggestion ──────────────────────────────────────────────

    /**
     * Suggest relevant Bible verse(s).
     *
     * Returns verse object or array. Never throws — degrades to static fallback
     * when all AI providers fail, keeping the UX alive.
     *
     * Returns { no_provider: true, ...staticVerse } when no keys are configured.
     */
    static async suggestBibleVerse(content, aiSettings = {}, count = 1) {
        const { openai_key, anthropic_key, preferred_model = DEFAULT_OPENAI_MODEL } = aiSettings;
        const openaiModel = resolveOpenAiModel(preferred_model);
        const anthropicModel = resolveAnthropicModel(preferred_model);
        const providerOrder = resolvePreferredProviders(preferred_model);
        const isMultiple = count > 1;

        const prompt = `
            You are a spiritual assistant for "The Stream".
            Find ${isMultiple ? count : "a relevant, encouraging, and accurate"} Bible verse${isMultiple ? "s" : ""} from the New King James Version (NKJV) that ${isMultiple ? "back up or complement" : "backs up or complements"} the following content.

            Content: "${String(content || "").slice(0, 800)}"

            ${isMultiple ? "Find verses offering different perspectives. Avoid similar verses." : ""}

            Respond ONLY in JSON format:
            ${isMultiple
                ? `{ "suggestions": [ { "verse": "Full text", "reference": "Book Chapter:Verse", "version": "NKJV" } ] }`
                : `{ "verse": "Full text", "reference": "Book Chapter:Verse", "version": "NKJV" }`
            }
        `;

        // No keys → static fallback immediately (not an error)
        if (!openai_key && !anthropic_key) {
            return { ...getStaticVerseFallback(content, count), no_provider: true };
        }

        let lastError = null;

        for (const provider of providerOrder) {
            if (provider === "openai" && openai_key) {
                // Short-circuit on quota — go straight to Anthropic
                try {
                    const response = await withTimeout(
                        axios.post(
                            "https://api.openai.com/v1/chat/completions",
                            {
                                model: openaiModel,
                                messages: [{ role: "user", content: prompt }],
                                response_format: { type: "json_object" },
                            },
                            {
                                headers: {
                                    Authorization: `Bearer ${openai_key}`,
                                    "Content-Type": "application/json",
                                },
                                timeout: TIMEOUT_TEXT_AI,
                            }
                        ),
                        TIMEOUT_TEXT_AI,
                        "OpenAI bible verse"
                    );
                    const result = JSON.parse(response.data.choices[0].message.content);
                    return isMultiple ? result.suggestions || [result] : result;
                } catch (error) {
                    lastError = error;
                    const label = isQuotaOrBillingError(error) ? "[QUOTA]" : isNetworkError(error) ? "[TIMEOUT]" : "[ERROR]";
                    console.error(`OpenAI Bible Verse ${label}:`, extractProviderErrorMessage(error));
                    if (!anthropic_key) {
                        // No fallback provider → use static verse
                        console.warn("No Anthropic key — returning static verse fallback.");
                        return { ...getStaticVerseFallback(content, count), _ai_failed: true };
                    }
                    // continue to Anthropic
                }
            }

            if (provider === "anthropic" && anthropic_key) {
                try {
                    const response = await withTimeout(
                        axios.post(
                            "https://api.anthropic.com/v1/messages",
                            {
                                model: anthropicModel,
                                max_tokens: 1024,
                                system: [
                                    {
                                        type: "text",
                                        text: `You are a spiritual assistant for "The Stream". Find relevant, encouraging, and accurate Bible verses from the NKJV.`,
                                        cache_control: { type: "ephemeral" },
                                    },
                                ],
                                messages: [{ role: "user", content: prompt }],
                            },
                            {
                                headers: {
                                    "x-api-key": anthropic_key,
                                    "anthropic-version": "2023-06-01",
                                    "Content-Type": "application/json",
                                },
                                timeout: TIMEOUT_TEXT_AI,
                            }
                        ),
                        TIMEOUT_TEXT_AI,
                        "Anthropic bible verse"
                    );
                    const text = response.data.content[0].text;
                    const jsonMatch = text.match(/\{.*\}/s);
                    if (jsonMatch) {
                        const result = JSON.parse(jsonMatch[0]);
                        return isMultiple ? result.suggestions || [result] : result;
                    }
                    throw new Error("Could not parse Anthropic bible verse response");
                } catch (error) {
                    lastError = error;
                    const label = isQuotaOrBillingError(error) ? "[QUOTA]" : isNetworkError(error) ? "[TIMEOUT]" : "[ERROR]";
                    console.error(`Anthropic Bible Verse ${label}:`, extractProviderErrorMessage(error));
                }
            }
        }

        // All AI providers failed → static fallback (never crash the request)
        console.warn("All bible verse providers failed. Returning static fallback verse.");
        return { ...getStaticVerseFallback(content, count), _ai_failed: true };
    }
}

module.exports = AIService;
