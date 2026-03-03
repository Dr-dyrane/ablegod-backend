/**
 * scripts/backfill_pair_keys.js
 *
 * One-time migration: compute and persist `pair_key` for all existing
 * direct ChatConversation records that do not yet have one.
 *
 * The pair_key is the canonical identity for a direct conversation:
 *   pair_key = min(memberA, memberB) + ":" + max(memberA, memberB)
 *
 * Run with:
 *   node scripts/backfill_pair_keys.js
 *
 * This script is idempotent: records that already have a pair_key are skipped.
 * After the backfill, the unique index on (type, pair_key) can be safely created.
 */

const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Load env
const projectRoot = path.resolve(__dirname, "..");
const envLocalPath = path.join(projectRoot, ".env.local");
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
dotenv.config({ path: path.join(projectRoot, ".env") });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_FALLBACK;
if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI not set. Aborting.");
    process.exit(1);
}

// Inline schema (avoid importing model to prevent index auto-creation conflicts)
const chatConversationSchema = new mongoose.Schema(
    {},
    { strict: false, collection: "chatconversations" }
);
const ChatConversation = mongoose.model("ChatConversation", chatConversationSchema);

function normalizePairKey(memberA, memberB) {
    const a = String(memberA || "").trim();
    const b = String(memberB || "").trim();
    if (!a || !b) return "";
    return [a, b].sort().join(":");
}

async function run() {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log("✅ Connected.");

    const total = await ChatConversation.countDocuments({ type: "direct" });
    console.log(`📊 Found ${total} direct conversation(s).`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process in batches to avoid memory pressure
    const batchSize = 200;
    let offset = 0;

    while (true) {
        const batch = await ChatConversation.find({ type: "direct" })
            .sort({ _id: 1 })
            .skip(offset)
            .limit(batchSize)
            .lean();

        if (batch.length === 0) break;

        for (const conv of batch) {
            if (conv.pair_key && typeof conv.pair_key === "string" && conv.pair_key.includes(":")) {
                skipped++;
                continue;
            }

            const members = Array.isArray(conv.member_ids) ? conv.member_ids : [];
            if (members.length !== 2) {
                console.warn(`  ⚠️  conv ${conv.id || conv._id} has ${members.length} member(s) — skipping.`);
                skipped++;
                continue;
            }

            const pairKey = normalizePairKey(members[0], members[1]);
            if (!pairKey) {
                console.warn(`  ⚠️  conv ${conv.id || conv._id} produced empty pair_key — skipping.`);
                skipped++;
                continue;
            }

            try {
                await ChatConversation.updateOne(
                    { _id: conv._id, $or: [{ pair_key: { $exists: false } }, { pair_key: "" }, { pair_key: null }] },
                    { $set: { pair_key: pairKey } }
                );
                updated++;
                if (updated % 50 === 0) {
                    console.log(`  ✍️  Updated ${updated} so far...`);
                }
            } catch (err) {
                console.error(`  ❌ Failed to update conv ${conv.id || conv._id}:`, err.message);
                errors++;
            }
        }

        offset += batchSize;
    }

    console.log("\n🎉 Backfill complete.");
    console.log(`   Updated : ${updated}`);
    console.log(`   Skipped : ${skipped}`);
    console.log(`   Errors  : ${errors}`);

    if (errors > 0) {
        console.warn("\n⚠️  Some records had errors. Review the log above before creating the unique index.");
    } else {
        console.log("\n✅ Safe to create the unique index on { type, pair_key }.");
    }

    await mongoose.disconnect();
    process.exit(errors > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
