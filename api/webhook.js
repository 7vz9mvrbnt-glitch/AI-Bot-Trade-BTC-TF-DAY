/**
 * POST /api/webhook
 * LINE Messaging API webhook — รับ event จาก LINE OA
 * รองรับ: text message "BTC" หรือ "setup" → reply Flex setup ปัจจุบัน
 *
 * Required env vars:
 *   LINE_CHANNEL_TOKEN   ← Channel access token
 *   LINE_CHANNEL_SECRET  ← Channel secret (สำหรับ verify signature)
 */

const crypto = require("crypto");
const { fetchCandles } = require("../lib/binance");
const { analyze, buildAIComment } = require("../lib/analyze");
const { replyMessage, buildSetupFlex, buildMacroFlex } = require("../lib/line");
const { detectSymbol, SYMBOLS } = require("../lib/symbols");
const { fetchCandles: fetchYahoo } = require("../lib/yahoo");

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

  console.log("WEBHOOK SOURCE:", JSON.stringify(req.body?.events?.map(e => e.source)));
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

    // ตรวจก่อนว่าข้อความระบุสินทรัพย์เฉพาะเจาะจงหรือเปล่า
    const specificEntry = detectSymbol(text);

    // "ภาพรวมตลาด" — บทวิเคราะห์เชื่อมทุกสินทรัพย์
    if (!specificEntry && (
      lower.includes("ภาพรวม") || lower.includes("วิเคราะห์ตลาด") ||
      lower.includes("overview") || lower.includes("market") ||
      lower.includes("ตลาดวันนี้") || lower.includes("สรุปตลาด")
    )) {
      try {
        const msgs = await buildMarketOverview();
        await replyMessage(event.replyToken, msgs);
      } catch (err) {
        console.error("[webhook] overview error:", err.message);
        try { await replyMessage(event.replyToken, [{ type: "text", text: `❌ ดึงข้อมูลไม่ได้: ${err.message}` }]); } catch (_) {}
      }
      continue;
    }

    // "ซื้ออะไรดี" — วิเคราะห์สินทรัพย์ทั้งหมด (เฉพาะเมื่อไม่ได้ระบุ asset)
    if (!specificEntry && (
      lower.includes("ซื้ออะไรดี") || lower.includes("ซื้ออะไร") ||
      lower.includes("ตัวไหนดี") || lower.includes("ซื้อ") || lower === "buy"
    )) {
      try {
        const msgs = await buildBuyRecommendation();
        await replyMessage(event.replyToken, msgs);
      } catch (err) {
        console.error("[webhook] buyRec error:", err.message);
        try { await replyMessage(event.replyToken, [{ type: "text", text: `❌ ดึงข้อมูลไม่ได้: ${err.message}` }]); } catch (_) {}
      }
      continue;
    }

    // "ขายตัวไหนดี" — วิเคราะห์สินทรัพย์ทั้งหมด (เฉพาะเมื่อไม่ได้ระบุ asset)
    if (!specificEntry && (
      lower.includes("ขายตัวไหน") || lower.includes("ขายอะไร") ||
      lower.includes("ควรขาย") || lower.includes("ขาย") || lower === "sell"
    )) {
      try {
        const msgs = await buildSellRecommendation();
        await replyMessage(event.replyToken, msgs);
      } catch (err) {
        console.error("[webhook] sellRec error:", err.message);
        try { await replyMessage(event.replyToken, [{ type: "text", text: `❌ ดึงข้อมูลไม่ได้: ${err.message}` }]); } catch (_) {}
      }
      continue;
    }

    const entry = specificEntry;
    if (!entry) continue;

    try {
      const fetcher = entry.source === "yahoo" ? fetchYahoo : fetchCandles;
      const candles = await fetcher(entry.symbol, 160);
      const setup = analyze(candles, entry.symbol, entry.source, entry.mode);
      setup.displayName = entry.displayName;
      setup.tradeNote = entry.tradeNote;
      setup.mode = entry.mode || null;
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

/**
 * บทวิเคราะห์ภาพรวมตลาดเชื่อมทุกสินทรัพย์
 * ลำดับ: Macro (DXY/Oil) → Crypto → หุ้น/ETF → ทอง → สรุป
 */
async function buildMarketOverview() {
  // ดึงข้อมูลทุกตัวพร้อมกัน
  const allEntries = SYMBOLS;
  const results = await Promise.allSettled(allEntries.map(fetchSetup));

  const bySymbol = {};
  allEntries.forEach((e, i) => {
    if (results[i].status === "fulfilled") bySymbol[e.symbol] = results[i].value;
  });

  const dxy  = bySymbol["DX-Y.NYB"];
  const oil  = bySymbol["CL=F"];
  const btc  = bySymbol["BTCUSDT"];
  const gold = bySymbol["PAXGUSDT"];
  const voo  = bySymbol["VOO"];
  const qqq  = bySymbol["QQQ"];

  const cryptos = ["BTCUSDT","ETHUSDT","BNBUSDT","XRPUSDT","SOLUSDT"]
    .map((s) => bySymbol[s]).filter(Boolean);
  const mag7   = ["AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA"]
    .map((s) => bySymbol[s]).filter(Boolean);

  const dxyUp = dxy?.trend === "UP";
  const oilUp = oil?.trend === "UP";
  const fmt   = (n) => n ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-";

  // ── 1) Macro environment
  let macroScore = 0; // -2 (ยาก) ถึง +2 (ดี)
  if (!dxyUp) macroScore++;
  if (!oilUp) macroScore++;
  const macroLabel = macroScore >= 2 ? "✅ ดี" : macroScore === 1 ? "⚠️ ปานกลาง" : "🔴 ยาก";

  // ── 2) Crypto score
  const cryptoUp = cryptos.filter((s) => s.trend === "UP").length;
  const cryptoLabel = cryptoUp >= 4 ? "✅ ส่วนใหญ่ขาขึ้น" : cryptoUp >= 2 ? "⚠️ ปนกัน" : "🔴 ส่วนใหญ่ขาลง";

  // ── 3) หุ้น score
  const stocksAll = [...mag7, voo, qqq].filter(Boolean);
  const stocksUp  = stocksAll.filter((s) => s.trend === "UP").length;
  const stockLabel = stocksUp >= Math.ceil(stocksAll.length * 0.7) ? "✅ ส่วนใหญ่ขาขึ้น"
    : stocksUp >= Math.ceil(stocksAll.length * 0.4) ? "⚠️ ปนกัน" : "🔴 ส่วนใหญ่ขาลง";

  // ── 4) DCA opportunity
  const allTradeable = [...cryptos, ...mag7, voo, qqq, gold].filter(Boolean);
  const dcaReady  = allTradeable.filter((s) => s.fibZone?.isDCAZone);
  const dcaNames  = dcaReady.map((s) => s.displayName || s.symbol).join(", ") || "ยังไม่มี";

  // ── Build messages
  const lines = [];

  // Header
  lines.push(`🌐 ภาพรวมตลาดวันนี้`);
  lines.push(`${"─".repeat(28)}`);

  // Macro
  lines.push(`\n📡 ปัจจัยมหภาค (Macro): ${macroLabel}`);
  if (dxy) lines.push(`  💵 DXY ดอลลาร์: ${dxy.trend === "UP" ? "▲ แข็งค่า" : "▼ อ่อนค่า"} (${fmt(dxy.price)})`);
  if (oil) lines.push(`  🛢 น้ำมัน WTI: ${oil.trend === "UP" ? "▲ แพงขึ้น" : "▼ ถูกลง"} ($${fmt(oil.price)})`);

  // Macro interpretation
  if (!dxyUp && !oilUp)      lines.push(`  → สภาพแวดล้อมเอื้อการลงทุน ดอลลาร์อ่อน + น้ำมันถูก`);
  else if (!dxyUp && oilUp)  lines.push(`  → ระวังเงินเฟ้อ น้ำมันแพงกดดันกำลังซื้อ`);
  else if (dxyUp && !oilUp)  lines.push(`  → ดอลลาร์แข็ง กดดัน Crypto/ทอง/EM`);
  else                        lines.push(`  → Stagflation risk — ดอลลาร์แข็ง + น้ำมันแพง ระวังตลาดผันผวน`);

  // Crypto
  lines.push(`\n🪙 Crypto (${cryptoUp}/${cryptos.length} ตัวขาขึ้น): ${cryptoLabel}`);
  cryptos.forEach((s) => {
    const arrow = s.trend === "UP" ? "▲" : "▼";
    const zone  = s.fibZone ? ` | ${s.fibZone.emoji} ${s.fibZone.label}` : "";
    lines.push(`  ${arrow} ${s.displayName || s.symbol} $${fmt(s.price)}${zone}`);
  });

  // หุ้น
  lines.push(`\n📈 หุ้น US + ETF (${stocksUp}/${stocksAll.length} ตัวขาขึ้น): ${stockLabel}`);
  stocksAll.forEach((s) => {
    const arrow = s.trend === "UP" ? "▲" : "▼";
    const zone  = s.fibZone ? ` | ${s.fibZone.emoji} ${s.fibZone.label}` : "";
    lines.push(`  ${arrow} ${s.displayName || s.symbol} $${fmt(s.price)}${zone}`);
  });

  // สรุปโอกาส DCA
  lines.push(`\n${"─".repeat(28)}`);
  lines.push(`🎯 โซน DCA น่าสะสมตอนนี้:`);
  if (dcaReady.length > 0) {
    dcaReady.forEach((s) => {
      lines.push(`  🟢 ${s.displayName || s.symbol} — ${s.fibZone.label} ($${fmt(s.price)})`);
    });
    lines.push(`💡 แบ่งซื้อ 2–3 ครั้ง อย่าใส่เงินทั้งหมดครั้งเดียว`);
  } else {
    lines.push(`  ยังไม่มีตัวที่ลงมาถึงโซน DCA ที่ดี — รอราคาปรับตัวก่อน`);
  }

  // Overall verdict
  const overallScore = macroScore + (cryptoUp >= 3 ? 1 : 0) + (stocksUp >= stocksAll.length * 0.5 ? 1 : 0);
  let verdict;
  if (overallScore >= 4)      verdict = "✅ ตลาดเอื้อ — เหมาะเปิด position / สะสม";
  else if (overallScore >= 2) verdict = "⚠️ ตลาดปานกลาง — เลือกสะสมเฉพาะตัวที่แข็งแกร่ง";
  else                        verdict = "🔴 ตลาดยาก — ถือเงินสดรอก่อน หรือ DCA น้อยมาก";

  lines.push(`\n📌 สรุป: ${verdict}`);

  return [{ type: "text", text: lines.join("\n") }];
}

/** ดึง setup ของ entry หนึ่งตัว */
async function fetchSetup(entry) {
  const fetcher = entry.source === "yahoo" ? fetchYahoo : fetchCandles;
  const candles = await fetcher(entry.symbol, 160);
  const setup = analyze(candles, entry.symbol, entry.source, entry.mode);
  setup.displayName = entry.displayName;
  setup.tradeNote   = entry.tradeNote;
  setup.mode        = entry.mode || null;
  setup.aiComment   = buildAIComment(setup);
  return setup;
}

/**
 * "ซื้ออะไรดี" — สแกน accumulate assets ทั้งหมด
 * คืน flex carousel ของตัวที่ recommendation เป็น "สะสมที่ Fib..." หรือเป็น Fib DCA zone
 * ถ้าไม่มีตัวไหนโดดเด่น ส่งข้อความแจ้ง
 */
async function buildBuyRecommendation() {
  // สแกนทุก asset ที่เป็น accumulate + crypto (สำหรับ DCA)
  const scanTargets = SYMBOLS.filter((s) => s.mode === "accumulate" || s.source === "binance");
  const results = await Promise.allSettled(scanTargets.map(fetchSetup));

  const goodBuys  = [];  // isDCAZone = true
  const watchList = [];  // Fib 38–50% (โซนกลาง)
  let macroOil = null, macroDxy = null;

  // ดึง macro ประกอบ
  const oilEntry = SYMBOLS.find((s) => s.symbol === "CL=F");
  const dxyEntry = SYMBOLS.find((s) => s.symbol === "DX-Y.NYB");
  try {
    if (oilEntry) macroOil = await fetchSetup(oilEntry);
    if (dxyEntry) macroDxy = await fetchSetup(dxyEntry);
  } catch (_) {}

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const s = r.value;
    if (!s.fibZone) continue;
    if (s.fibZone.isDCAZone) goodBuys.push(s);
    else if (s.fibZone.label.includes("38.2") || s.fibZone.label.includes("50%")) watchList.push(s);
  }

  // สร้าง macro context text
  const macroCtx = buildMacroContext(macroDxy, macroOil);

  if (goodBuys.length === 0 && watchList.length === 0) {
    return [{
      type: "text",
      text: `🔍 ยังไม่มีสินทรัพย์ที่ลงมาถึงโซน DCA ที่ดีในตอนนี้\n\n` +
            `💡 ราคาส่วนใหญ่ยังอยู่สูง — รอให้ราคาปรับตัวลงมาก่อน\n\n` +
            macroCtx,
    }];
  }

  const msgs = [];

  // Flex carousel ของตัวที่น่าซื้อ (max 10 bubble)
  const featured = [...goodBuys, ...watchList].slice(0, 10);
  if (featured.length > 0) {
    const bubbles = featured.map((s) => buildSetupFlex(s).contents);
    msgs.push({
      type: "flex",
      altText: `🟢 น่าซื้อสะสม: ${featured.map((s) => s.displayName || s.symbol).join(", ")}`,
      contents: { type: "carousel", contents: bubbles },
    });
  }

  // สรุปข้อความ
  const summaryLines = ["📊 สรุปโอกาสซื้อสะสมวันนี้\n"];
  if (goodBuys.length > 0) {
    summaryLines.push(`✅ โซน DCA ดี (Fib 50–78.6%)`);
    goodBuys.forEach((s) => summaryLines.push(`  • ${s.displayName || s.symbol} — ${s.fibZone.emoji} ${s.fibZone.label} ($${s.price.toLocaleString()})`));
  }
  if (watchList.length > 0) {
    summaryLines.push(`\n⏳ ยังแพงนิดหน่อย — รอเพิ่มหรือซื้อน้อยก่อน`);
    watchList.forEach((s) => summaryLines.push(`  • ${s.displayName || s.symbol} — ${s.fibZone.emoji} ${s.fibZone.label} ($${s.price.toLocaleString()})`));
  }
  if (macroCtx) summaryLines.push("\n" + macroCtx);
  summaryLines.push("\n💡 แบ่งซื้อ 2–3 ครั้ง อย่าใส่เงินทั้งหมดครั้งเดียว");

  msgs.push({ type: "text", text: summaryLines.join("\n") });
  return msgs;
}

/**
 * "ขายตัวไหนดี" — สแกน หาตัวที่ราคาสูง / trend กลับ / ใกล้ Swing High
 * ตัวอย่างเกณฑ์: อยู่ใน Fib 0–23.6% (แพง), หรือ trend DOWN หลังจากวิ่งขึ้นมา
 */
async function buildSellRecommendation() {
  const scanTargets = SYMBOLS.filter((s) => s.mode === "accumulate" || s.source === "binance");
  const results = await Promise.allSettled(scanTargets.map(fetchSetup));

  const highZone   = [];  // Fib 0–23.6% (แพง ควรพิจารณาขาย/ลด)
  const midZone    = [];  // Fib 23.6–38.2% (ยังสูง)
  const downTrend  = [];  // trend DOWN (สัญญาณอ่อนแรง)

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const s = r.value;
    if (!s.fibZone) continue;
    const lbl = s.fibZone.label;
    if (lbl.includes("0–23.6") || lbl.includes("เหนือ Swing")) highZone.push(s);
    else if (lbl.includes("23.6–38.2")) midZone.push(s);
    if (s.trend === "DOWN") downTrend.push(s);
  }

  if (highZone.length === 0 && downTrend.length === 0) {
    return [{
      type: "text",
      text: `🔍 ยังไม่มีสินทรัพย์ที่แสดงสัญญาณควรขายชัดเจนในตอนนี้\n\n` +
            `💡 ราคาส่วนใหญ่อยู่ในโซนกลาง — ยังไม่ถึงเวลาขาย\n` +
            `📌 ถ้าถือกำไรอยู่แล้ว อาจพิจารณา Take Profit บางส่วน (30–50%) เพื่อลดความเสี่ยง`,
    }];
  }

  const msgs = [];

  // Flex carousel ของตัวที่น่าพิจารณาขาย
  const featured = [...new Set([...highZone, ...downTrend])].slice(0, 10);
  if (featured.length > 0) {
    const bubbles = featured.map((s) => buildSetupFlex(s).contents);
    msgs.push({
      type: "flex",
      altText: `🔴 ควรพิจารณาขาย: ${featured.map((s) => s.displayName || s.symbol).join(", ")}`,
      contents: { type: "carousel", contents: bubbles },
    });
  }

  // สรุป
  const summaryLines = ["📊 สรุปสัญญาณควรพิจารณาขาย/ลด Position\n"];
  if (highZone.length > 0) {
    summaryLines.push(`🔴 ราคาสูง — อยู่แถวจุดสูงสุด (Fib 0–23.6%)`);
    highZone.forEach((s) => summaryLines.push(`  • ${s.displayName || s.symbol} — ${s.fibZone.emoji} ${s.fibZone.label} ($${s.price.toLocaleString()})`));
    summaryLines.push(`  💡 ถ้าถือกำไรอยู่ ควรพิจารณา Take Profit บางส่วน`);
  }
  if (downTrend.length > 0) {
    summaryLines.push(`\n📉 Trend กลับเป็นขาลง — อ่อนแรง`);
    downTrend.forEach((s) => summaryLines.push(`  • ${s.displayName || s.symbol} — EMA8 ${s.ema8} < EMA21 ${s.ema21}`));
    summaryLines.push(`  💡 ถ้ายังไม่ขาย อาจตั้ง Stop Loss ป้องกันไว้`);
  }
  summaryLines.push("\n⚠️ ขายทั้งหมดทีเดียวมักไม่ดี — แบ่งขาย 2–3 ครั้ง");

  msgs.push({ type: "text", text: summaryLines.join("\n") });
  return msgs;
}

/** สรุปภาวะ macro เป็นข้อความสั้น */
function buildMacroContext(dxy, oil) {
  if (!dxy || !oil) return "";
  const dxyUp = dxy.trend === "UP";
  const oilUp = oil.trend === "UP";
  if (!dxyUp && !oilUp) return "🌐 Macro: ดอลลาร์อ่อน + น้ำมันถูก — เอื้อต่อการสะสม";
  if (!dxyUp && oilUp)  return "🌐 Macro: ดอลลาร์อ่อน แต่น้ำมันแพง — ระวังเงินเฟ้อ";
  if (dxyUp && !oilUp)  return "🌐 Macro: ดอลลาร์แข็ง — กดดัน Crypto/ทอง";
  return "🌐 Macro: ดอลลาร์แข็ง + น้ำมันแพง — สภาพแวดล้อมยาก ระวัง";
}

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
            ["BTC / บีทีซี", "Swing & Day Trade"],
            ["ETH / อีเธอร์", "Swing Trade"],
            ["BNB / บีเอ็นบี", "Swing Trade"],
            ["XRP / ริปเปิล", "Day & Swing Trade"],
            ["SOL / โซลานา", "Day Trade · ผันผวนสูงมาก"],
            ["PAXG / ทอง / Gold", "Position · ป้องกันความเสี่ยง"],
          ]),
          { type: "separator", margin: "md" },
          section("📈 Magnificent 7 (Yahoo)", [
            ["AAPL / Apple", "Swing & Position"],
            ["MSFT / Microsoft", "Swing & Position"],
            ["NVDA / Nvidia", "Swing · AI/Chip theme"],
            ["GOOGL / Google", "Swing & Position"],
            ["AMZN / Amazon", "Swing & Position"],
            ["META / Facebook", "Swing · ข่าวแรง"],
            ["TSLA / Tesla", "Day & Swing · ผันผวนสูงมาก"],
          ]),
          { type: "separator", margin: "md" },
          section("📦 ETF (Yahoo)", [
            ["VOO / S&P / SP500", "ETF · สะสม/ถือยาว"],
            ["QQQ / NASDAQ / NDX", "ETF · สะสม/ถือยาว · Tech"],
          ]),
          { type: "separator", margin: "md" },
          section("🤖 คำสั่งอัจฉริยะ", [
            ["ภาพรวม / ตลาดวันนี้ / overview", "บทวิเคราะห์เชื่อมทุกสินทรัพย์"],
            ["ซื้ออะไรดี / ซื้อ / buy", "สแกนทุกตัว → แนะนำโซน DCA"],
            ["ขายตัวไหนดี / ขาย / sell", "สแกนทุกตัว → แจ้งตัวที่ราคาสูง"],
          ]),
          { type: "separator", margin: "md" },
          {
            type: "text",
            text: "💡 พิมพ์ชื่อสินทรัพย์ใดก็ได้ด้านบน → บอทจะตอบด้วยการ์ด Setup + คำแนะนำ AI",
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
