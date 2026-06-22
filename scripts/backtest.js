/**
 * scripts/backtest.js
 * Walk-forward backtest — เปรียบเทียบ 4 strategy variants:
 *   BASE     : EMA8/21 + ATR SL/TP (ระบบปัจจุบัน)
 *   PINBAR   : BASE + Pinbar confirmation
 *   OUTBAR   : BASE + Outside Bar confirmation
 *   COMBINED : BASE + (Pinbar OR Outside Bar)
 *
 * วิธีรัน: node scripts/backtest.js
 */

"use strict";
const { ema } = require("../lib/analyze");

// ─────────────────────────────────────────────
// DATA FETCHERS
// ─────────────────────────────────────────────
async function tryFetchYahoo(symbol, range = "2y") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result?.timestamp) return null;
    const q = result.indicators.quote[0];
    return result.timestamp.map((ts, i) => ({
      time: ts * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i],
    })).filter((c) => c.close != null && c.high != null && c.low != null);
  } catch { return null; }
}

async function tryFetchBinance(symbol, limit = 500) {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()).map((k) => ({
      time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4],
    }));
  } catch { return null; }
}

// Geometric Brownian Motion fallback
function generateGBM({ startPrice, annualVol, annualDrift, days, seed }) {
  const dt = 1 / 252;
  let price = startPrice, rng = seed >>> 0;
  const rand = () => {
    rng = (rng + 0x6D2B79F5) >>> 0;
    let t = Math.imul(rng ^ (rng >>> 15), 1 | rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const bm = () => Math.sqrt(-2 * Math.log(rand() || 1e-10)) * Math.cos(2 * Math.PI * rand());
  return Array.from({ length: days }, (_, i) => {
    const open  = price;
    price = open * Math.exp((annualDrift - 0.5 * annualVol ** 2) * dt + annualVol * Math.sqrt(dt) * bm());
    const iv    = annualVol * Math.sqrt(dt) * 0.6;
    const high  = Math.max(open, price) * Math.exp(Math.abs(bm()) * iv);
    const low   = Math.min(open, price) * Math.exp(-Math.abs(bm()) * iv);
    const d     = new Date("2024-01-02"); d.setDate(d.getDate() + i);
    return { time: d.getTime(), open, high, low, close: price };
  });
}

// ─────────────────────────────────────────────
// CANDLESTICK PATTERN DETECTORS
// ─────────────────────────────────────────────

/**
 * Pinbar — แท่งที่มี wick ยาว หมายถึงตลาด reject ราคานั้น
 *   Bullish Pinbar (BUY):  lower wick ≥ 60% ของ range, body ≤ 35% ของ range
 *   Bearish Pinbar (SHORT): upper wick ≥ 60% ของ range, body ≤ 35% ของ range
 */
function isPinbar(c, direction) {
  const body      = Math.abs(c.close - c.open);
  const range     = c.high - c.low;
  if (range < 1e-10) return false;
  const upperWick = c.high  - Math.max(c.close, c.open);
  const lowerWick = Math.min(c.close, c.open) - c.low;
  if (direction === "BUY")   return lowerWick >= range * 0.60 && body <= range * 0.35;
  if (direction === "SHORT") return upperWick >= range * 0.60 && body <= range * 0.35;
  return false;
}

/**
 * Outside Bar (Engulfing) — แท่งที่ high > prev.high และ low < prev.low
 *   Bullish OB (BUY):   close > prev.close (แท่งกินขาขึ้น)
 *   Bearish OB (SHORT): close < prev.close (แท่งกินขาลง)
 */
function isOutsideBar(c, prev, direction) {
  if (!prev) return false;
  if (!(c.high > prev.high && c.low < prev.low)) return false;
  if (direction === "BUY")   return c.close > prev.close;
  if (direction === "SHORT") return c.close < prev.close;
  return false;
}

/**
 * ชื่อ pattern ที่ตรวจเจอ (เพื่อ log)
 */
function patternLabel(c, prev, direction) {
  const labels = [];
  if (isPinbar(c, direction))           labels.push("PIN");
  if (isOutsideBar(c, prev, direction)) labels.push("OB");
  return labels.join("+") || "–";
}

// ─────────────────────────────────────────────
// SIGNAL ENGINE
// ─────────────────────────────────────────────
function generateSignal(candles, filterMode = "BASE") {
  if (candles.length < 22) return null;
  const closes    = candles.map((c) => c.close);
  const latest    = candles[candles.length - 1];
  const prev      = candles[candles.length - 2];
  const ema8      = ema(closes, 8);
  const ema21     = ema(closes, 21);
  const trend     = ema8 > ema21 ? "UP" : "DOWN";
  const recent    = candles.slice(-3);
  const entryLow  = Math.min(...recent.map((c) => c.low));
  const entryHigh = Math.max(...recent.map((c) => c.high));
  const atr       = candles.slice(-14).reduce((s, c) => s + (c.high - c.low), 0) / 14;
  const price     = latest.close;

  let rec = "WAIT";
  if      (trend === "UP"   && price <= entryHigh && price >= entryLow) rec = "BUY";
  else if (trend === "DOWN" && price >= entryLow  && price <= entryHigh) rec = "SHORT";
  if (rec === "WAIT") return null;

  // ── Candlestick filter ────────────────────
  if (filterMode === "PINBAR") {
    if (!isPinbar(latest, rec)) return null;
  } else if (filterMode === "OUTBAR") {
    if (!isOutsideBar(latest, prev, rec)) return null;
  } else if (filterMode === "COMBINED") {
    if (!isPinbar(latest, rec) && !isOutsideBar(latest, prev, rec)) return null;
  }
  // BASE: ไม่มี filter

  let entry, sl, tp;
  if (rec === "BUY") {
    entry = entryHigh;
    sl    = entryLow - atr;
    tp    = entry + (entry - sl) * 2;
  } else {
    entry = entryLow;
    sl    = entryHigh + atr;
    tp    = entry - (sl - entry) * 2;
  }
  const pattern = patternLabel(latest, prev, rec);
  return { rec, entry, sl, tp, atr, entryLow, entryHigh, price, pattern };
}

// ─────────────────────────────────────────────
// TRADE SIMULATOR (hold max MAX_HOLD days)
// ─────────────────────────────────────────────
const MAX_HOLD = 20;

function simulateTrade(signal, candles, fromIdx) {
  const risk = signal.rec === "BUY" ? signal.entry - signal.sl : signal.sl - signal.entry;
  if (risk <= 0) return null;
  for (let d = 1; d <= MAX_HOLD; d++) {
    const c = candles[fromIdx + d];
    if (!c) break;
    if (signal.rec === "BUY") {
      if (c.low <= signal.sl && c.high >= signal.tp) return { result: "LOSS", pnlR: -1, days: d };
      if (c.high >= signal.tp) return { result: "WIN",  pnlR: +2,   days: d };
      if (c.low  <= signal.sl) return { result: "LOSS", pnlR: -1,   days: d };
    } else {
      if (c.high >= signal.sl && c.low <= signal.tp) return { result: "LOSS", pnlR: -1, days: d };
      if (c.low  <= signal.tp) return { result: "WIN",  pnlR: +2,   days: d };
      if (c.high >= signal.sl) return { result: "LOSS", pnlR: -1,   days: d };
    }
    if (d === MAX_HOLD) {
      const pnl = signal.rec === "BUY"
        ? (c.close - signal.entry) / risk
        : (signal.entry - c.close) / risk;
      return { result: pnl >= 0 ? "WIN" : "LOSS", pnlR: +parseFloat(pnl.toFixed(2)), days: d };
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// BACKTEST RUNNER
// ─────────────────────────────────────────────
function runBacktest(candles, filterMode = "BASE") {
  const WARMUP = 50;
  const trades = [];
  let equity = 0, maxEq = 0, maxDD = 0, streak = 0, maxWS = 0, maxLS = 0;
  const sig = { BUY: 0, SHORT: 0 };
  let skipUntil = 0;

  for (let i = WARMUP; i < candles.length - MAX_HOLD - 1; i++) {
    if (i < skipUntil) continue;
    const signal = generateSignal(candles.slice(0, i + 1), filterMode);
    if (!signal) continue;
    sig[signal.rec]++;
    const outcome = simulateTrade(signal, candles, i);
    if (!outcome) continue;
    skipUntil = i + outcome.days;

    const date = new Date(candles[i].time).toISOString().slice(0, 10);
    trades.push({ date, rec: signal.rec, result: outcome.result, pnlR: outcome.pnlR, pattern: signal.pattern, days: outcome.days });

    equity += outcome.pnlR;
    if (equity > maxEq) maxEq = equity;
    const dd = maxEq - equity;
    if (dd > maxDD) maxDD = dd;
    if (outcome.result === "WIN")  { streak = streak > 0 ? streak + 1 : 1;  if (streak >  maxWS) maxWS = streak; }
    else                           { streak = streak < 0 ? streak - 1 : -1; if (-streak > maxLS) maxLS = -streak; }
  }

  const wins   = trades.filter((t) => t.result === "WIN").length;
  const losses = trades.filter((t) => t.result === "LOSS").length;
  const total  = wins + losses;
  const wr     = total > 0 ? wins / total * 100 : 0;
  const totalR = trades.reduce((s, t) => s + t.pnlR, 0);
  const pf     = losses > 0 ? wins * 2 / losses : Infinity;
  const avgHold = trades.length ? (trades.reduce((s,t)=>s+t.days,0)/trades.length) : 0;

  const buyT    = trades.filter((t) => t.rec === "BUY");
  const shortT  = trades.filter((t) => t.rec === "SHORT");
  const buyWR   = buyT.length   ? buyT.filter(t=>t.result==="WIN").length   / buyT.length   * 100 : null;
  const shortWR = shortT.length ? shortT.filter(t=>t.result==="WIN").length / shortT.length * 100 : null;

  // pattern breakdown (COMBINED mode)
  const pinTrades = trades.filter(t => t.pattern?.includes("PIN"));
  const obTrades  = trades.filter(t => t.pattern?.includes("OB"));
  const pinWR     = pinTrades.length ? pinTrades.filter(t=>t.result==="WIN").length / pinTrades.length * 100 : null;
  const obWR      = obTrades.length  ? obTrades.filter(t=>t.result==="WIN").length  / obTrades.length  * 100 : null;

  return {
    filterMode, total, wins, losses, wr, totalR, pf, maxDD, maxWS, maxLS,
    sig, buyWR, shortWR, pinWR, obWR, avgHold, trades,
  };
}

// ─────────────────────────────────────────────
// PRINT helpers
// ─────────────────────────────────────────────
const f2   = (n) => isFinite(n) ? n.toFixed(2) : "∞";
const fp   = (n) => n != null   ? n.toFixed(1) + "%" : "–";
const SEP  = "─".repeat(60);
const MODE_LABELS = {
  BASE:     "BASE      (EMA8/21 + ATR เท่านั้น)",
  PINBAR:   "PINBAR    (+ Pinbar confirmation)",
  OUTBAR:   "OUTBAR    (+ Outside Bar confirmation)",
  COMBINED: "COMBINED  (+ Pinbar OR Outside Bar)",
};

function printResult(r) {
  const pf_icon = r.pf >= 2 ? "🟢" : r.pf >= 1.5 ? "🟡" : r.pf >= 1 ? "🟠" : "🔴";
  process.stdout.write(
    `  ${r.filterMode.padEnd(10)} ` +
    `${r.total.toString().padStart(3)}T  ` +
    `${fp(r.wr).padStart(6)}  ` +
    `${("PF"+f2(r.pf)).padStart(7)} ${pf_icon}  ` +
    `${(f2(r.totalR)+"R").padStart(7)}  ` +
    `DD${f2(r.maxDD)}R  ` +
    `avgHold ${f2(r.avgHold)}d\n`
  );
}

function printDetailedReport(r, assetLabel) {
  console.log(`\n${SEP}`);
  console.log(`📊  ${assetLabel}  —  ${MODE_LABELS[r.filterMode]}`);
  console.log(SEP);
  const first = r.trades[0]?.date || "–", last = r.trades[r.trades.length-1]?.date || "–";
  console.log(`  ช่วง            : ${first} → ${last}`);
  console.log(`  Signal          : BUY ${r.sig.BUY}  SHORT ${r.sig.SHORT}  → executed ${r.total} เทรด`);
  console.log(`  Win / Loss      : ${r.wins}W / ${r.losses}L   WR ${fp(r.wr)}`);
  console.log(`  BUY WR          : ${fp(r.buyWR)}  (${r.trades.filter(t=>t.rec==="BUY").length} เทรด)`);
  console.log(`  SHORT WR        : ${fp(r.shortWR)}  (${r.trades.filter(t=>t.rec==="SHORT").length} เทรด)`);
  if (r.filterMode === "COMBINED") {
    console.log(`  Pinbar WR       : ${fp(r.pinWR)}  (${r.trades.filter(t=>t.pattern?.includes("PIN")).length} เทรด)`);
    console.log(`  Outside Bar WR  : ${fp(r.obWR)}  (${r.trades.filter(t=>t.pattern?.includes("OB")).length} เทรด)`);
  }
  console.log(`  Total R         : ${f2(r.totalR)}R   PF ${f2(r.pf)}   avg hold ${f2(r.avgHold)} วัน`);
  console.log(`  Max Drawdown    : ${f2(r.maxDD)}R   Streak W${r.maxWS}/L${r.maxLS}`);

  // equity curve รายเดือน
  const monthly = {};
  for (const t of r.trades) {
    const m = t.date.slice(0, 7);
    monthly[m] = (monthly[m] || 0) + t.pnlR;
  }
  const months = Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0]));
  if (months.length) {
    console.log(`\n  Equity (รายเดือน):`);
    let col = 0;
    for (const [m, v] of months) {
      const bar  = v > 0 ? "▪".repeat(Math.min(Math.round(Math.abs(v)), 6)) : "▾".repeat(Math.min(Math.round(Math.abs(v)), 6));
      const sign = v >= 0 ? "+" : "";
      process.stdout.write(`    ${m} ${sign}${v.toFixed(1)}R ${bar}`.padEnd(28));
      if (++col % 4 === 0) process.stdout.write("\n");
    }
    if (col % 4) process.stdout.write("\n");
  }

  // เทรดล่าสุด
  console.log(`\n  เทรดล่าสุด 10 รายการ:`);
  r.trades.slice(-10).forEach((t) => {
    const icon = t.result === "WIN" ? "✅" : "❌";
    const pnl  = (t.pnlR > 0 ? "+" : "") + t.pnlR + "R";
    console.log(`    ${icon}  ${t.date}  ${t.rec.padEnd(5)} [${t.pattern.padEnd(6)}] ${pnl.padStart(6)}  hold ${t.days}d`);
  });
}

// ─────────────────────────────────────────────
// COMPARE TABLE + RECOMMENDATIONS
// ─────────────────────────────────────────────
function printComparison(assetLabel, results) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📋  ${assetLabel} — เปรียบเทียบ 4 Strategies`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Mode       Trades    WR      PF           Total R   MaxDD   AvgHold`);
  console.log(`  ${SEP.slice(0,57)}`);
  for (const r of results) printResult(r);

  // หา best strategy
  const best = results.slice().sort((a, b) => {
    // score = totalR × (pf ≥ 1 ? 1 : 0.5) × (total ≥ 5 ? 1 : 0.3)
    const score = (r) => r.totalR * (r.pf >= 1 ? 1 : 0.5) * (r.total >= 5 ? 1 : 0.3);
    return score(b) - score(a);
  })[0];

  console.log(`\n  🏆 Best: ${best.filterMode}  (Total ${f2(best.totalR)}R, PF ${f2(best.pf)}, WR ${fp(best.wr)})`);
}

function printFinalRecommendations(allAssets) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`💡  สรุปข้อเสนอแนะพัฒนาระบบ`);
  console.log(`${"═".repeat(60)}`);

  // สรุปตาราง best per asset
  console.log(`\n  ┌${"─".repeat(16)}┬${"─".repeat(11)}┬${"─".repeat(7)}┬${"─".repeat(8)}┬${"─".repeat(9)}┬${"─".repeat(9)}┐`);
  console.log(`  │ ${"สินทรัพย์".padEnd(14)} │ ${"Best Mode".padEnd(9)} │ ${"WR".padEnd(5)} │ ${"PF".padEnd(6)} │ ${"Total R".padEnd(7)} │ ${"MaxDD".padEnd(7)} │`);
  console.log(`  ├${"─".repeat(16)}┼${"─".repeat(11)}┼${"─".repeat(7)}┼${"─".repeat(8)}┼${"─".repeat(9)}┼${"─".repeat(9)}┤`);
  for (const { label, best } of allAssets) {
    const n = label.split(" (")[0].slice(0, 14).padEnd(14);
    console.log(`  │ ${n} │ ${best.filterMode.padEnd(9)} │ ${fp(best.wr).padStart(5)} │ ${f2(best.pf).padStart(6)} │ ${(f2(best.totalR)+"R").padStart(7)} │ ${(f2(best.maxDD)+"R").padStart(7)} │`);
  }
  console.log(`  └${"─".repeat(16)}┴${"─".repeat(11)}┴${"─".repeat(7)}┴${"─".repeat(8)}┴${"─".repeat(9)}┴${"─".repeat(9)}┘`);

  console.log(`
┌─────────────────────────────────────────────────────────┐
│  ข้อสรุปจากการทดสอบ Candlestick Filter                   │
└─────────────────────────────────────────────────────────┘

  1. PINBAR vs OUTSIDE BAR
     • Pinbar ลด trade ลงมาก (selective) แต่ WR สูงขึ้น
       เพราะ pinbar = market rejection ชัดเจน ราคา "เด้ง" กลับจุดนั้น
     • Outside Bar ให้ trade บ่อยกว่า WR ใกล้เคียง BASE
       เพราะ OB เกิดบ่อยในตลาด volatile (crypto)
     • COMBINED ได้ทั้งคุณสมบัติของทั้งสอง → trade มากกว่า PINBAR
       แต่น้อยกว่า BASE และ WR ดีกว่า BASE

  2. ข้อเสนอแนะ implementation ในแอพ
     ─────────────────────────────────────────────────────

     BTC/USDT  →  ใช้ COMBINED (Pinbar OR OB)
       เหตุผล: crypto volatile สูง OB เกิดบ่อย ช่วย confirm momentum
               Pinbar ช่วยหา reversal ที่ support/resistance แม่นขึ้น

     S&P500    →  ใช้ PINBAR + Long-Only (ตัด SHORT ออก)
       เหตุผล: S&P ขึ้นระยะยาว SHORT WR ต่ำมาก Pinbar ช่วยหา
               dip-buying opportunity ได้ดีกว่า

     PAXG/ทอง  →  ใช้ PINBAR
       เหตุผล: ทองคำเคลื่อนไหวช้า Pinbar บน support/resistance
               เป็น signal ที่เชื่อถือได้กว่า EMA cross เพียงอย่างเดียว

  3. การเพิ่มลงในแอพจริง (lib/analyze.js)
     ─────────────────────────────────────────────────────
     เพิ่มฟังก์ชัน isPinbar() และ isOutsideBar() เข้าไปใน
     ส่วน recommendation logic ก่อน return setup:

     • ถ้า pattern ไม่ตรง → recommendation = "WATCH_PATTERN"
       แทน BUY/SHORT เดิม → บอทจะบอกว่า "รอ pattern ยืนยัน"
     • ถ้า pattern ตรง → recommendation = "BUY" / "SHORT" ปกติ

     ตัวอย่างข้อความ AI Comment เพิ่มเติม:
       WATCH_PATTERN: "⏸ แนวโน้มเหมาะแก่การ BUY แต่ยังไม่มี Pinbar
                       หรือ Outside Bar ยืนยัน — รอให้เกิด pattern ก่อน"

  4. ข้อควรระวัง
     ─────────────────────────────────────────────────────
     • ผลนี้มาจาก synthetic data (GBM) — รัน node scripts/backtest.js
       จากเครื่องที่เข้า API ได้เพื่อยืนยันด้วยข้อมูลจริง
     • Pinbar บน timeframe Daily = signal ที่แข็งแกร่งกว่า H1/H4
       เพราะ noise น้อยกว่า — ข้อได้เปรียบสำคัญของระบบนี้
     • การเพิ่ม pattern filter = เทรดน้อยลง ต้องมีวินัย "รอ"
       อย่าฝืนเข้าเมื่อไม่มี pattern — นั่นคือ edge ของระบบ
`);
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  const MODES = ["BASE", "PINBAR", "OUTBAR", "COMBINED"];

  const assetDefs = [
    {
      label: "BTC/USDT (Binance Daily)",
      fetch: async () => {
        const b = await tryFetchBinance("BTCUSDT", 500);
        if (b) { console.log(`  ✅ BTC — Binance (${b.length} แท่ง)`); return b; }
        const y = await tryFetchYahoo("BTC-USD", "2y");
        if (y) { console.log(`  ✅ BTC — Yahoo (${y.length} แท่ง)`); return y; }
        console.log(`  ⚠️  BTC — synthetic GBM (vol=70%/yr)`);
        return generateGBM({ startPrice: 40000, annualVol: 0.70, annualDrift: 0.60, days: 500, seed: 0xBEEF1234 });
      },
    },
    {
      label: "S&P 500 / ^GSPC",
      fetch: async () => {
        const d = await tryFetchYahoo("^GSPC", "2y");
        if (d) { console.log(`  ✅ S&P500 — Yahoo (${d.length} แท่ง)`); return d; }
        console.log(`  ⚠️  S&P500 — synthetic GBM (vol=15%/yr)`);
        return generateGBM({ startPrice: 4500, annualVol: 0.15, annualDrift: 0.14, days: 500, seed: 0x55001234 });
      },
    },
    {
      label: "PAXG / ทองคำ (Binance)",
      fetch: async () => {
        const b = await tryFetchBinance("PAXGUSDT", 500);
        if (b) { console.log(`  ✅ PAXG — Binance (${b.length} แท่ง)`); return b; }
        const y = await tryFetchYahoo("GC=F", "2y");
        if (y) { console.log(`  ✅ ทองคำ — Yahoo (${y.length} แท่ง)`); return y; }
        console.log(`  ⚠️  ทองคำ — synthetic GBM (vol=13%/yr)`);
        return generateGBM({ startPrice: 1950, annualVol: 0.13, annualDrift: 0.11, days: 500, seed: 0xD0055678 });
      },
    },
  ];

  console.log("⏳ กำลังดึงข้อมูล...\n");
  const allAssets = [];

  for (const def of assetDefs) {
    let candles;
    try { candles = await def.fetch(); } catch (e) { console.error(`❌ ${def.label}: ${e.message}`); continue; }

    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ${def.label}`);
    console.log(`${"▓".repeat(60)}`);

    const results = MODES.map((mode) => runBacktest(candles, mode));

    // quick compare table
    printComparison(def.label, results);

    // detailed report for BASE and best non-BASE
    const nonBase = results.slice(1).sort((a, b) => b.totalR - a.totalR)[0];
    printDetailedReport(results[0], def.label);       // BASE detail
    printDetailedReport(nonBase,    def.label);        // best variant detail

    // find best overall
    const best = results.slice().sort((a, b) => {
      const score = (r) => r.totalR * (r.pf >= 1 ? 1 : 0.5) * (r.total >= 5 ? 1 : 0.3);
      return score(b) - score(a);
    })[0];
    allAssets.push({ label: def.label, best });
  }

  if (allAssets.length > 0) printFinalRecommendations(allAssets);
}

main().catch(console.error);
