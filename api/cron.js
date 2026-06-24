/**
 * GET /api/cron
 * Triggered by Vercel Cron at 00:00 UTC = 07:00 ICT every day
 * Push Flex Message ไปยัง LINE Group
 *
 * Security: ตรวจ Authorization header ที่ Vercel ส่งมาให้ (CRON_SECRET)
 *
 * Push budget (LINE free 200/เดือน):
 *   Morning cron 07:00 ICT (/api/cron):
 *   - Daily carousel (BTC/PAXG/VOO) : 1/day × 30 = 30
 *   - Daily macro card (Oil+DXY)     : 1/day × 30 = 30
 *   - News digest (ถ้ามีข่าวสำคัญ)   : 0–1/day × 30 ≤ 30
 *   - RSI alert (RSI ≤ 35)           : 0–1/day × 30 ≤ 30
 *   - Weekly summary (วันจันทร์)      : 1/week × 4  = 4
 *
 *   Afternoon cron 19:00 ICT (/api/cron-alert):
 *   - Oversold alert crypto (RSI ≤ 30): 0–1/day × 30 ≤ 30
 *
 *   worst-case total: 154/200 ✅
 */

const { fetchCandles } = require("../lib/binance");
const { fetchCandles: fetchYahoo } = require("../lib/yahoo");
const { analyze, buildAIComment } = require("../lib/analyze");
const { pushMessage, buildSetupFlex, buildMacroFlex } = require("../lib/line");
const { SYMBOLS } = require("../lib/symbols");
const { buildDailyNewsDigest } = require("../lib/news");

// RSI threshold สำหรับ alert
const RSI_ALERT_THRESHOLD = 35;

module.exports = async function handler(req, res) {
  const authHeader = req.headers["authorization"] || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const targets = (process.env.LINE_PUSH_TARGETS || "").split(",").filter(Boolean);
    const allResults = [];
    const flexBubbles  = [];
    const allSetups    = {};   // symbol → setup (ใช้สร้าง weekly summary)
    const rsiAlerts    = [];   // setups ที่ RSI ต่ำกว่า threshold

    const PUSH_SYMBOLS  = ["BTCUSDT", "PAXGUSDT", "VOO"];
    const MACRO_SYMBOLS = ["CL=F", "DX-Y.NYB"];

    // ── 1) ดึงข้อมูลทุก symbol ──────────────────────────────────────
    const macroSetups = {};
    for (const entry of SYMBOLS) {
      const { symbol, source, displayName } = entry;
      const result = { symbol, line: "pending" };
      try {
        const fetcher = source === "yahoo" ? fetchYahoo : fetchCandles;
        const candles = await fetcher(symbol, 160);
        const setup = analyze(candles, symbol, source, entry.mode);
        setup.displayName = displayName;
        setup.tradeNote   = entry.tradeNote;
        setup.mode        = entry.mode || null;
        setup.aiComment   = buildAIComment(setup);

        allSetups[symbol] = setup;

        if (PUSH_SYMBOLS.includes(symbol)) {
          flexBubbles.push(buildSetupFlex(setup).contents);
        }
        if (MACRO_SYMBOLS.includes(symbol)) {
          macroSetups[symbol] = setup;
        }
        // เก็บ asset ที่ RSI ต่ำกว่า threshold (ยกเว้น indicator)
        if (entry.mode !== "indicator" && setup.rsi && setup.rsi.value <= RSI_ALERT_THRESHOLD) {
          rsiAlerts.push(setup);
        }
      } catch (e) {
        result.line = `error: ${e.message}`;
        console.error(`[cron] error (${symbol}):`, e.message);
      }
      allResults.push(result);
    }

    // ── 2) ส่ง carousel หลัก — BTC / ทอง / S&P500 ──────────────────
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

    // ── 3) ส่ง Macro card — Oil + DXY ──────────────────────────────
    const oilSetup = macroSetups["CL=F"];
    const dxySetup = macroSetups["DX-Y.NYB"];
    if (oilSetup && dxySetup) {
      const macroMsg = buildMacroFlex(oilSetup, dxySetup);
      for (const to of targets) {
        try { await pushMessage(to.trim(), [macroMsg]); }
        catch (e) { console.error(`[cron] LINE push error (macro):`, e.message); }
      }
    }

    // ── 4) RSI Alert — batch รวม 1 message ถ้ามีตัวที่ RSI ต่ำ ──────
    if (rsiAlerts.length > 0) {
      const alertMsg = buildRsiAlertMessage(rsiAlerts);
      for (const to of targets) {
        try { await pushMessage(to.trim(), [alertMsg]); }
        catch (e) { console.error(`[cron] LINE push error (rsi-alert):`, e.message); }
      }
    }

    // ── 5) Daily News Digest — ส่งถ้ามีข่าวสำคัญ ────────────────────
    try {
      const newsMsg = await buildDailyNewsDigest(SYMBOLS);
      if (newsMsg) {
        for (const to of targets) {
          try { await pushMessage(to.trim(), [newsMsg]); }
          catch (e) { console.error(`[cron] LINE push error (news):`, e.message); }
        }
      }
    } catch (e) {
      console.error("[cron] news digest error:", e.message);
    }

    // ── 6) Weekly Summary — ส่งเฉพาะวันจันทร์ (UTC day=1) ──────────
    const todayUTC = new Date().getUTCDay();
    if (todayUTC === 1) {
      // oilSetup/dxySetup อาจเป็น undefined ถ้า macro fetch fail — ส่ง null แทน
      const weeklyMsg = buildWeeklySummary(allSetups, oilSetup ?? null, dxySetup ?? null);
      for (const to of targets) {
        try { await pushMessage(to.trim(), [weeklyMsg]); }
        catch (e) { console.error(`[cron] LINE push error (weekly):`, e.message); }
      }
    }

    return res.status(200).json({ ok: true, results: allResults, rsiAlerts: rsiAlerts.length });
  } catch (err) {
    console.error("[cron] fatal:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ── RSI Alert message ────────────────────────────────────────────────
function buildRsiAlertMessage(alerts) {
  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines = [
    `🔔 แจ้งเตือน RSI ต่ำ — โอกาสสะสม`,
    `${"─".repeat(28)}`,
    `ราคาลงมาถึงโซนน่าสนใจแล้ว ${alerts.length} ตัว:\n`,
  ];
  for (const s of alerts) {
    const name = s.displayName || s.symbol;
    const rsiLabel = s.rsi.zone === "oversold" ? "🟢 ถูกมาก" : "🟢 เริ่มถูก";
    const fibInfo  = s.fibZone?.isDCAZone ? ` | ${s.fibZone.emoji} ${s.fibZone.label}` : "";
    const score    = s.signalScore ? ` ${s.signalScore.emoji}` : "";
    lines.push(`${rsiLabel} ${name}${score}`);
    lines.push(`  ราคา $${fmt(s.price)} | RSI ${s.rsi.value}${fibInfo}`);
    if (s.macd?.cross === "bullish") lines.push(`  ⚡ Momentum กลับเป็นบวก — สัญญาณแข็งแกร่ง`);
    lines.push("");
  }
  lines.push(`💡 แบ่งซื้อ 2–3 ครั้ง อย่าใส่เงินทั้งหมดครั้งเดียว`);
  lines.push(`⚠️ ถ้าราคายังลงต่อ รอรับที่แนวถัดไปได้อีก`);
  return { type: "text", text: lines.join("\n") };
}

// ── Weekly Summary (ส่งวันจันทร์) ────────────────────────────────────
function buildWeeklySummary(setups, oil, dxy) {
  const fmt = (n) => (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const now = new Date();
  const weekStr = now.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "long", day: "numeric",
  });

  const cryptoSymbols = ["BTCUSDT","ETHUSDT","BNBUSDT","XRPUSDT","SOLUSDT"];
  const stockSymbols  = ["AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","VOO","QQQ","PAXGUSDT"];

  const cryptoList = cryptoSymbols.map((s) => setups[s]).filter(Boolean);
  const stockList  = stockSymbols.map((s) => setups[s]).filter(Boolean);

  const cryptoUp = cryptoList.filter((s) => s.trend === "UP").length;
  const stockUp  = stockList.filter((s) => s.trend === "UP").length;

  // หา DCA ready
  const dcaReady = [...cryptoList, ...stockList].filter((s) => s.fibZone?.isDCAZone);
  // หา overbought warning
  const hotAssets = [...cryptoList, ...stockList].filter((s) => s.rsi?.zone === "overbought");

  // Macro
  const dxyUp = dxy?.trend === "UP";
  const oilUp = oil?.trend === "UP";
  let macroOutlook;
  if (!dxyUp && !oilUp)     macroOutlook = "✅ เอื้อต่อการลงทุน";
  else if (!dxyUp && oilUp) macroOutlook = "⚠️ ระวังเงินเฟ้อ";
  else if (dxyUp && !oilUp) macroOutlook = "⚠️ ดอลลาร์แข็ง กดดัน Crypto/ทอง";
  else                       macroOutlook = "🔴 Stagflation risk";

  const lines = [
    `📅 สรุปภาพรวมตลาดประจำสัปดาห์`,
    `${weekStr}`,
    `${"─".repeat(30)}`,
    ``,
    `🌐 Macro: ${macroOutlook}`,
    `  💵 DXY ${dxy ? (dxyUp ? "▲ แข็ง" : "▼ อ่อน") : "-"}  🛢 น้ำมัน ${oil ? (oilUp ? "▲ แพง" : "▼ ถูก") : "-"}`,
    ``,
    `🪙 Crypto: ${cryptoUp}/${cryptoList.length} ตัวขาขึ้น`,
    ...cryptoList.map((s) => `  ${s.trend === "UP" ? "▲" : "▼"} ${s.displayName || s.symbol} $${fmt(s.price)} ${s.signalScore?.emoji || ""}`),
    ``,
    `📈 หุ้น + ETF: ${stockUp}/${stockList.length} ตัวขาขึ้น`,
    ...stockList.map((s) => `  ${s.trend === "UP" ? "▲" : "▼"} ${s.displayName || s.symbol} $${fmt(s.price)} ${s.signalScore?.emoji || ""}`),
    ``,
    `${"─".repeat(30)}`,
  ];

  if (dcaReady.length > 0) {
    lines.push(`🎯 โซน DCA น่าสะสมสัปดาห์นี้:`);
    dcaReady.forEach((s) => lines.push(`  🟢 ${s.displayName || s.symbol} — ${s.fibZone.label}`));
    lines.push(``);
  }
  if (hotAssets.length > 0) {
    lines.push(`🔴 ระวัง — ราคาวิ่งสูงเกินไปแล้ว:`);
    hotAssets.forEach((s) => lines.push(`  • ${s.displayName || s.symbol} RSI ${s.rsi.value} (แพงเกินไป)`));
    lines.push(``);
  }

  const overallUp = cryptoUp + stockUp;
  const overallTotal = cryptoList.length + stockList.length;
  let verdict;
  if (overallUp >= overallTotal * 0.7) verdict = "✅ ตลาดแข็งแกร่ง — เหมาะสะสมเพิ่ม";
  else if (overallUp >= overallTotal * 0.4) verdict = "⚖️ ตลาดปานกลาง — เลือกเฉพาะตัวที่แข็ง";
  else verdict = "🔴 ตลาดอ่อนแอ — รอจังหวะ ถือเงินสดก่อน";

  lines.push(`📌 สรุปสัปดาห์: ${verdict}`);
  return { type: "text", text: lines.join("\n") };
}
