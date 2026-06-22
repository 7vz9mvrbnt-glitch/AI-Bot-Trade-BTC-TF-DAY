/**
 * POST /api/webhook
 * LINE Messaging API webhook — รับ event จาก LINE OA
 * รองรับ: text message ชื่อสินทรัพย์ → reply Flex setup | "help"/"วิธีใช้" → reply เมนู
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
    const lower = text.toLowerCase();

    // Help command
    if (lower === "help" || lower === "วิธีใช้") {
      try {
        await replyMessage(event.replyToken, [buildHelpMessage()]);
      } catch (_) {}
      continue;
    }

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

function buildHelpMessage() {
  return {
    type: "flex",
    altText: "📖 วิธีใช้งาน AI Trade Bot",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1f2937",
        contents: [
          { type: "text", text: "📖 วิธีใช้งาน AI Trade Bot", color: "#FFFFFF", size: "md", weight: "bold" },
          { type: "text", text: "พิมพ์ชื่อสินทรัพย์เพื่อดู Daily Setup", color: "#9ca3af", size: "xs", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          section("🪙 Crypto (Binance)", [
            ["BTC / บีทีซี", "Bitcoin"],
            ["ETH / อีเธอร์", "Ethereum"],
            ["BNB / บีเอ็นบี", "BNB"],
            ["XRP / ริปเปิล", "Ripple"],
            ["SOL / โซลานา", "Solana"],
            ["PAXG / ทอง / Gold", "PAX Gold"],
          ]),
          { type: "separator", margin: "md" },
          section("📈 Magnificent 7 (Yahoo)", [
            ["AAPL / Apple / แอปเปิล", "Apple Inc."],
            ["MSFT / Microsoft / ไมโครซอฟต์", "Microsoft"],
            ["NVDA / Nvidia / เอ็นวิเดีย", "Nvidia"],
            ["GOOGL / Google / กูเกิล", "Alphabet"],
            ["AMZN / Amazon / อเมซอน", "Amazon"],
            ["META / Facebook / เฟซบุ๊ก", "Meta"],
            ["TSLA / Tesla / เทสลา", "Tesla"],
          ]),
          { type: "separator", margin: "md" },
          section("🌐 Index (Yahoo)", [
            ["S&P / SP500 / เอสแอนด์พี", "S&P 500"],
            ["NASDAQ / NDX / แนสแด็ก", "NASDAQ 100"],
          ]),
          { type: "separator", margin: "md" },
          {
            type: "text",
            text: "💡 พิมพ์ชื่อใดก็ได้ด้านบน → บอทจะตอบด้วยการ์ด Setup + คำแนะนำ AI",
            size: "xs", color: "#6b7280", wrap: true, margin: "md",
          },
        ],
      },
    },
  };
}

function section(title, rows) {
  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    contents: [
      { type: "text", text: title, size: "sm", weight: "bold", color: "#374151", margin: "sm" },
      ...rows.map(([cmd, desc]) => ({
        type: "box",
        layout: "horizontal",
        margin: "xs",
        contents: [
          { type: "text", text: cmd,  size: "xs", color: "#111827", flex: 5, wrap: true },
          { type: "text", text: desc, size: "xs", color: "#6b7280", flex: 3, align: "end" },
        ],
      })),
    ],
  };
}
