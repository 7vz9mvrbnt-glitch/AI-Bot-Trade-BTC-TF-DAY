/**
 * GET /api/cron
 * Triggered by Vercel Cron at 00:00 UTC = 07:00 ICT every day
 * 1. คำนวณ BTC setup
 * 2. บันทึกลง Google Sheet แท็บ "Daily Log"
 * 3. Push Flex Message ไปยัง LINE Group
 *
 * Security: ตรวจ Authorization header ที่ Vercel ส่งมาให้ (CRON_SECRET)
 */

const { fetchCandles } = require("../lib/binance");
const { fetchCandles: fetchYahoo } = require("../lib/yahoo");
const { analyze, toSheetRow, buildAIComment } = require("../lib/analyze");
const { appendRow } = require("../lib/sheets");
const { pushMessage, buildSetupFlex } = require("../lib/line");
const { SYMBOLS } = require("../lib/symbols");

module.exports = async function handler(req, res) {
  const authHeader = req.headers["authorization"] || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const targets = (process.env.LINE_PUSH_TARGETS || "").split(",").filter(Boolean);
    const allResults = [];
    const flexBubbles = [];

    // ส่ง LINE push เฉพาะ 3 สินทรัพย์หลัก (BTC, ทอง, S&P500)
    const PUSH_SYMBOLS = ["BTCUSDT", "PAXGUSDT", "^GSPC"];
    const pushTargets = SYMBOLS.filter((s) => PUSH_SYMBOLS.includes(s.symbol));

    // 1) ดึงข้อมูลและบันทึก Sheet ทุก symbol แต่ส่ง LINE เฉพาะ pushTargets
    for (const entry of SYMBOLS) {
      const { symbol, source, displayName } = entry;
      const result = { symbol, sheet: null, line: "pending" };
      try {
        const fetcher = source === "yahoo" ? fetchYahoo : fetchCandles;
        const candles = await fetcher(symbol, 50);
        const setup = analyze(candles, symbol, source, entry.mode);
        setup.displayName = displayName;
        setup.tradeNote = entry.tradeNote;
        setup.mode = entry.mode || null;
        setup.aiComment = buildAIComment(setup);

        try {
          await appendRow("Daily Log", toSheetRow(setup));
          result.sheet = "ok";
        } catch (e) {
          result.sheet = `error: ${e.message}`;
          console.error(`[cron] sheet error (${symbol}):`, e.message);
        }

        // เก็บเฉพาะ 3 ตัวหลักไว้รวม carousel
        if (PUSH_SYMBOLS.includes(symbol)) {
          const flex = buildSetupFlex(setup);
          flexBubbles.push(flex.contents);
        }
      } catch (e) {
        result.sheet = `fatal: ${e.message}`;
        console.error(`[cron] fatal (${symbol}):`, e.message);
      }
      allResults.push(result);
    }

    // 2) ส่ง LINE push ครั้งเดียว — 3 bubble รวมเป็น carousel
    if (flexBubbles.length > 0) {
      const carousel = {
        type: "flex",
        altText: `📊 Daily Setup — BTC · ทอง · S&P500`,
        contents: { type: "carousel", contents: flexBubbles },
      };
      for (const to of targets) {
        try {
          await pushMessage(to.trim(), [carousel]);
          allResults.filter((r) => PUSH_SYMBOLS.includes(r.symbol))
            .forEach((r) => { r.line = "ok"; });
        } catch (e) {
          console.error(`[cron] LINE push error:`, e.message);
          allResults.filter((r) => PUSH_SYMBOLS.includes(r.symbol))
            .forEach((r) => { r.line = `error: ${e.message}`; });
        }
      }
    }

    return res.status(200).json({ ok: true, results: allResults });
  } catch (err) {
    console.error("[cron] fatal:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
