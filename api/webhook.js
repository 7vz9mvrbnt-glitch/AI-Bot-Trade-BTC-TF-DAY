/**
 * POST /api/webhook
 * LINE Messaging API webhook — รับ event จาก LINE OA
 * รองรับ: พิมพ์ชื่อเหรียญ/หุ้น เช่น BTC, ETH, AAPL, NVDA, nasdaq → reply Flex setup
 *
 * Required env vars:
 *   LINE_CHANNEL_TOKEN   ← Channel access token
 *   LINE_CHANNEL_SECRET  ← Channel secret (สำหรับ verify signature)
 */

const crypto = require("crypto");
const { fetchCandles } = require("../lib/binance");
const { fetchCandles: fetchYahoo } = require("../lib/yahoo");
const { analyze, buildAIComment } = require("../lib/analyze");
const { replyMessage, buildSetupFlex } = require("../lib/line");
const { detectSymbol } = require("../lib/symbols");

function verifySignature(body, signature, secret) {
  const hash = crypto
    .createHmac("SHA256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.LINE_CHANNEL_SECRET;
  if (secret) {
    const sig = req.headers["x-line-signature"];
    const rawBody = JSON.stringify(req.body);
    if (!sig || !verifySignature(rawBody, sig, secret)) {
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  const events = req.body?.events || [];

  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text") continue;

    const text = (event.message.text || "").trim();
    const entry = detectSymbol(text);

    if (!entry) continue;

    try {
      const fetcher = entry.source === "yahoo" ? fetchYahoo : fetchCandles;
      const candles = await fetcher(entry.symbol, 50);
      const setup = analyze(candles, entry.symbol);
      setup.displayName = entry.displayName;
      setup.aiComment = buildAIComment(setup);
      const flex = buildSetupFlex(setup);
      await replyMessage(event.replyToken, [flex]);
    } catch (err) {
      console.error("[webhook] error:", err.message);
      try {
        await replyMessage(event.replyToken, [
          { type: "text", text: `❌ ดึงข้อมูลไม่ได้: ${err.message}` },
        ]);
      } catch (_) {}
    }
  }

  return res.status(200).json({ ok: true });
};
