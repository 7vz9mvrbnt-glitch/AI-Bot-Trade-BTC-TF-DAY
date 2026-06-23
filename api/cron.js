/**
 * GET /api/cron
 * Triggered by Vercel Cron at 00:00 UTC = 07:00 ICT every day
 * Push Flex Message ไปยัง LINE Group
 *
 * Security: ตรวจ Authorization header ที่ Vercel ส่งมาให้ (CRON_SECRET)
 */

const { fetchCandles } = require("../lib/binance");
const { fetchCandles: fetchYahoo } = require("../lib/yahoo");
const { analyze, buildAIComment } = require("../lib/analyze");
const { pushMessage, buildSetupFlex, buildMacroFlex } = require("../lib/line");
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

    const PUSH_SYMBOLS  = ["BTCUSDT", "PAXGUSDT", "VOO"];
    const MACRO_SYMBOLS = ["CL=F", "DX-Y.NYB"];

    const macroSetups = {};
    for (const entry of SYMBOLS) {
      const { symbol, source, displayName } = entry;
      const result = { symbol, line: "pending" };
      try {
        const fetcher = source === "yahoo" ? fetchYahoo : fetchCandles;
        const candles = await fetcher(symbol, 50);
        const setup = analyze(candles, symbol, source, entry.mode);
        setup.displayName = displayName;
        setup.tradeNote   = entry.tradeNote;
        setup.mode        = entry.mode || null;
        setup.aiComment   = buildAIComment(setup);

        if (PUSH_SYMBOLS.includes(symbol)) {
          flexBubbles.push(buildSetupFlex(setup).contents);
        }
        if (MACRO_SYMBOLS.includes(symbol)) {
          macroSetups[symbol] = setup;
        }
      } catch (e) {
        result.line = `error: ${e.message}`;
        console.error(`[cron] error (${symbol}):`, e.message);
      }
      allResults.push(result);
    }

    // ส่ง carousel หลัก — BTC / ทอง / S&P500
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
          console.error(`[cron] LINE push error (main):`, e.message);
        }
      }
    }

    // ส่ง Macro card — Oil + DXY
    const oilSetup = macroSetups["CL=F"];
    const dxySetup = macroSetups["DX-Y.NYB"];
    if (oilSetup && dxySetup) {
      const macroMsg = buildMacroFlex(oilSetup, dxySetup);
      for (const to of targets) {
        try {
          await pushMessage(to.trim(), [macroMsg]);
        } catch (e) {
          console.error(`[cron] LINE push error (macro):`, e.message);
        }
      }
    }

    return res.status(200).json({ ok: true, results: allResults });
  } catch (err) {
    console.error("[cron] fatal:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
