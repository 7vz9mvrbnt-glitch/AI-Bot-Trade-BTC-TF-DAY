/**
 * GET /api/cron-alert
 * Triggered by Vercel Cron at 12:00 UTC = 19:00 ICT every day
 * สแกน Crypto (24/7) หาตัวที่ RSI ≤ 30 (Oversold) ระหว่างวัน
 * ส่งเฉพาะเมื่อมีสัญญาณ — ไม่ส่งถ้าไม่มีอะไรน่าสนใจ
 *
 * Push budget contribution:
 *   - 0–1/day × 30 ≤ 30/month (เฉพาะวันที่ trigger)
 */

const { fetchCandles } = require("../lib/binance");
const { analyze, buildAIComment } = require("../lib/analyze");
const { pushMessage } = require("../lib/line");
const { getSymbols } = require("../lib/symbols");

const OVERSOLD_THRESHOLD = 30; // เข้มกว่า morning cron (35) เพื่อกรอง noise

module.exports = async function handler(req, res) {
  const authHeader = req.headers["authorization"] || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const targets = (process.env.LINE_PUSH_TARGETS || "").split(",").filter(Boolean);
    if (targets.length === 0) return res.status(200).json({ ok: true, skipped: "no targets" });

    // สแกนเฉพาะ Crypto (24/7 — หุ้นปิดตลาดแล้วตอน 19:00 ICT)
    const allSymbols = await getSymbols();
    const cryptoEntries = allSymbols.filter((s) => s.source === "binance" && s.mode !== "indicator" && s.pushAlert !== false);

    const alerts = [];
    for (const entry of cryptoEntries) {
      try {
        const candles = await fetchCandles(entry.symbol, 160);
        const setup = analyze(candles, entry.symbol, "binance", entry.mode);
        setup.displayName = entry.displayName;
        setup.mode = entry.mode || null;

        if (setup.rsi && setup.rsi.value <= OVERSOLD_THRESHOLD) {
          alerts.push(setup);
        }
      } catch (e) {
        console.error(`[cron-alert] error (${entry.symbol}):`, e.message);
      }
    }

    if (alerts.length === 0) {
      return res.status(200).json({ ok: true, sent: false, reason: "no oversold assets" });
    }

    const msg = buildOversoldAlert(alerts);
    for (const to of targets) {
      try { await pushMessage(to.trim(), [msg]); }
      catch (e) { console.error(`[cron-alert] push error:`, e.message); }
    }

    return res.status(200).json({ ok: true, sent: true, alerts: alerts.length });
  } catch (err) {
    console.error("[cron-alert] fatal:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

function buildOversoldAlert(alerts) {
  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lines = [
    `🚨 แจ้งเตือนช่วงเย็น — RSI Oversold`,
    `${"─".repeat(28)}`,
    `Crypto ลงมาถึงโซน Oversold แล้ว ${alerts.length} ตัว\n`,
  ];

  for (const s of alerts) {
    const name = s.displayName || s.symbol;
    const fibInfo = s.fibZone?.isDCAZone ? ` · ${s.fibZone.emoji} ${s.fibZone.label}` : "";
    const macdHint = s.macd?.cross === "bullish" ? "\n  ⚡ MACD Bullish Cross — โมเมนตัมกลับบวก" : "";
    const score = s.signalScore ? ` ${s.signalScore.emoji}` : "";

    lines.push(`🟢 ${name}${score}`);
    lines.push(`  ราคา $${fmt(s.price)}`);
    lines.push(`  RSI ${s.rsi.value} — Oversold (ถูกมาก)${fibInfo}${macdHint}`);
    lines.push("");
  }

  lines.push(`💡 เคล็ดลับมือใหม่:`);
  lines.push(`  • RSI Oversold = ราคาลงมาเร็วเกินไป มักเด้งกลับ`);
  lines.push(`  • แบ่งซื้อ 2–3 ครั้ง ไม่ใส่ทั้งหมดครั้งเดียว`);
  lines.push(`  • ถ้าราคายังลงต่อ รอโซนถัดไปแล้วค่อยซื้อเพิ่ม`);
  lines.push(`\n📊 ดูรายละเอียด: ${process.env.DASHBOARD_URL || "dashboard"}`);

  return { type: "text", text: lines.join("\n") };
}
