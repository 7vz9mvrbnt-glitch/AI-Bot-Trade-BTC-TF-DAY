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
const { analyze, toSheetRow } = require("../lib/analyze");
const { appendRow } = require("../lib/sheets");
const { pushMessage, buildSetupFlex } = require("../lib/line");

module.exports = async function handler(req, res) {
  const authHeader = req.headers["authorization"] || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const candles = await fetchCandles("BTCUSDT", 50);
    const setup = analyze(candles, "BTCUSDT");

    const results = {};

    try {
      await appendRow("Daily Log", toSheetRow(setup));
      results.sheet = "ok";
    } catch (e) {
      results.sheet = `error: ${e.message}`;
      console.error("[cron] sheet error:", e.message);
    }

    const targets = (process.env.LINE_PUSH_TARGETS || "").split(",").filter(Boolean);
    const flex = buildSetupFlex(setup);
    const lineResults = [];
    for (const to of targets) {
      try {
        await pushMessage(to.trim(), [flex]);
        lineResults.push({ to: to.trim(), status: "ok" });
      } catch (e) {
        lineResults.push({ to: to.trim(), status: `error: ${e.message}` });
        console.error("[cron] LINE push error:", e.message);
      }
    }
    results.line = lineResults;

    return res.status(200).json({ ok: true, setup, results });
  } catch (err) {
    console.error("[cron] fatal:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
