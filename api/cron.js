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

    for (const entry of SYMBOLS) {
      const { symbol, source, displayName } = entry;
      const result = { symbol, sheet: null, line: [] };
      try {
        const fetcher = source === "yahoo" ? fetchYahoo : fetchCandles;
        const candles = await fetcher(symbol, 50);
        const setup = analyze(candles, symbol);
        setup.displayName = displayName;
        setup.aiComment = buildAIComment(setup);

        try {
          await appendRow("Daily Log", toSheetRow(setup));
          result.sheet = "ok";
        } catch (e) {
          result.sheet = `error: ${e.message}`;
          console.error(`[cron] sheet error (${symbol}):`, e.message);
        }

        const flex = buildSetupFlex(setup);
        for (const to of targets) {
          try {
            await pushMessage(to.trim(), [flex]);
            result.line.push({ to: to.trim(), status: "ok" });
          } catch (e) {
            result.line.push({ to: to.trim(), status: `error: ${e.message}` });
            console.error(`[cron] LINE push error (${symbol}):`, e.message);
          }
        }
      } catch (e) {
        result.sheet = `fatal: ${e.message}`;
        console.error(`[cron] fatal (${symbol}):`, e.message);
      }
      allResults.push(result);
    }

    return res.status(200).json({ ok: true, results: allResults });
  } catch (err) {
    console.error("[cron] fatal:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
