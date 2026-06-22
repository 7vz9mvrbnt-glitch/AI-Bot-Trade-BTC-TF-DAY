/**
 * GET /api/btc
 * Returns today's BTC setup as JSON for the dashboard
 * Query params: ?symbol=BTCUSDT (default)
 *
 * CORS: open (*) — ให้ dashboard.html ที่เปิดในเบราว์เซอร์ fetch ได้โดยตรง
 */

const { fetchCandles } = require("../lib/binance");
const { fetchCandles: fetchYahoo } = require("../lib/yahoo");
const { analyze } = require("../lib/analyze");
const { SYMBOLS } = require("../lib/symbols");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const symbol = req.query?.symbol || "BTCUSDT";
    const entry = SYMBOLS.find((s) => s.symbol === symbol);
    const fetcher = entry?.source === "yahoo" ? fetchYahoo : fetchCandles;
    const candles = await fetcher(symbol, 50);
    const setup = analyze(candles, symbol);
    setup.displayName = entry?.displayName || symbol;
    setup.tradeNote = entry?.tradeNote || "";
    return res.status(200).json({ ok: true, setup, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[btc.js]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
