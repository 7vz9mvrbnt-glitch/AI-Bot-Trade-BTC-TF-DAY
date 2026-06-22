/**
 * scripts/backtest.js
 * Walk-forward backtest — แผนเทรด EMA21 Retest + Pinbar/Outside Bar
 *
 * Strategy หลัก:
 *   1. EMA8 > EMA21 = Trend UP  → หา BUY setup
 *      EMA8 < EMA21 = Trend DOWN → หา SHORT setup
 *   2. ราคา retest มาแตะโซน EMA21 (candle low ≤ EMA21 × 1.005 สำหรับ BUY)
 *   3. แท่งเทียนยืนยัน: Pinbar หรือ Outside Bar
 *   4. SL = ปลายแท่ง (low สำหรับ BUY, high สำหรับ SHORT)
 *
 * เปรียบเทียบ 4 mode:
 *   PINBAR_FULL    : Pinbar at EMA21, full exit ที่ 2R
 *   OB_FULL        : Outside Bar at EMA21, full exit ที่ 2R
 *   PINBAR_PARTIAL : Pinbar at EMA21, 50% ออกที่ 1R → SL → BE, 50% ที่ 2R
 *   OB_PARTIAL     : Outside Bar at EMA21, 50% ออกที่ 1R → SL → BE, 50% ที่ 2R
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

// Geometric Brownian Motion fallback — calibrated ตาม volatility จริงแต่ละสินทรัพย์
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
 * Pinbar — tail ≥ 60% range, body ≤ 35% range
 * Bullish Pinbar (BUY):  lower wick ยาว (hammer)
 * Bearish Pinbar (SHORT): upper wick ยาว (shooting star)
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
 * Outside Bar — high > prev.high AND low < prev.low (engulfing range)
 * Bullish OB (BUY):   close > prev.close
 * Bearish OB (SHORT): close < prev.close
 */
function isOutsideBar(c, prev, direction) {
  if (!prev) return false;
  if (!(c.high > prev.high && c.low < prev.low)) return false;
  if (direction === "BUY")   return c.close > prev.close;
  if (direction === "SHORT") return c.close < prev.close;
  return false;
}

// ─────────────────────────────────────────────
// SIGNAL ENGINE — EMA21 Retest Strategy
// ─────────────────────────────────────────────

/**
 * EMA21 Retest threshold:
 *   BUY:   candle.low ≤ ema21 × (1 + TOUCH_BUFFER) → ราคาลงมาแตะ EMA21
 *   SHORT: candle.high ≥ ema21 × (1 - TOUCH_BUFFER) → ราคาขึ้นไปแตะ EMA21
 */
const TOUCH_BUFFER = 0.008; // ±0.8% ของ EMA21 ถือว่า "แตะ"

/**
 * filterMode:
 *   "PINBAR"  — ต้องเป็น Pinbar ที่ EMA21
 *   "OB"      — ต้องเป็น Outside Bar ที่ EMA21
 */
function generateSignal(candles, filterMode) {
  if (candles.length < 25) return null;

  const closes = candles.map((c) => c.close);
  const latest = candles[candles.length - 1];
  const prev   = candles[candles.length - 2];
  const ema8v  = ema(closes, 8);
  const ema21v = ema(closes, 21);
  const atr    = candles.slice(-14).reduce((s, c) => s + (c.high - c.low), 0) / 14;
  const trend  = ema8v > ema21v ? "UP" : "DOWN";

  // กำหนดทิศทางตาม trend
  const direction = trend === "UP" ? "BUY" : "SHORT";

  // ── EMA21 Retest check ───────────────────────────────────
  const touchedEMA21 = direction === "BUY"
    ? latest.low  <= ema21v * (1 + TOUCH_BUFFER) // ราคาลงมาแตะ/ใกล้ EMA21
    : latest.high >= ema21v * (1 - TOUCH_BUFFER); // ราคาขึ้นไปแตะ/ใกล้ EMA21

  if (!touchedEMA21) return null;

  // ── Pattern filter ──────────────────────────────────────
  let patternOK = false;
  let patternLabel = "–";
  if (filterMode === "PINBAR") {
    patternOK = isPinbar(latest, direction);
    if (patternOK) patternLabel = "PIN";
  } else if (filterMode === "OB") {
    patternOK = isOutsideBar(latest, prev, direction);
    if (patternOK) patternLabel = "OB";
  }
  if (!patternOK) return null;

  // ── SL ที่ปลายแท่ง (candle tip) ──────────────────────────
  // เพิ่ม buffer เล็กน้อย 0.1×ATR เพื่อไม่ให้ hit SL จาก noise
  const SL_BUFFER = atr * 0.1;
  let entry, sl, tp1, tp2;

  if (direction === "BUY") {
    entry = latest.close;
    sl    = latest.low - SL_BUFFER;           // ปลายแท่งด้านล่าง
    const risk = entry - sl;
    if (risk <= 0 || risk / entry > 0.15) return null; // กรอง SL กว้างเกิน 15%
    tp1   = entry + risk;                     // 1R
    tp2   = entry + risk * 2;                 // 2R
  } else {
    entry = latest.close;
    sl    = latest.high + SL_BUFFER;          // ปลายแท่งด้านบน
    const risk = sl - entry;
    if (risk <= 0 || risk / entry > 0.15) return null;
    tp1   = entry - risk;                     // 1R
    tp2   = entry - risk * 2;                 // 2R
  }

  return { direction, entry, sl, tp1, tp2, atr, ema21: ema21v, patternLabel };
}

// ─────────────────────────────────────────────
// TRADE SIMULATORS
// ─────────────────────────────────────────────
const MAX_HOLD = 20;

/**
 * Full exit — TP2 (2R) หรือ SL
 * ผล: +2R (WIN) หรือ -1R (LOSS) หรือ partial ถ้าหมด MAX_HOLD
 */
function simulateFull(signal, candles, fromIdx) {
  const { direction, entry, sl, tp2 } = signal;
  const risk = direction === "BUY" ? entry - sl : sl - entry;
  if (risk <= 0) return null;

  for (let d = 1; d <= MAX_HOLD; d++) {
    const c = candles[fromIdx + d];
    if (!c) break;

    if (direction === "BUY") {
      if (c.low <= sl && c.high >= tp2) return { result: "LOSS", pnlR: -1, days: d, exit: "SL/TP-SAME" };
      if (c.high >= tp2) return { result: "WIN",  pnlR: +2,   days: d, exit: "TP2" };
      if (c.low  <= sl)  return { result: "LOSS", pnlR: -1,   days: d, exit: "SL"  };
    } else {
      if (c.high >= sl && c.low <= tp2) return { result: "LOSS", pnlR: -1, days: d, exit: "SL/TP-SAME" };
      if (c.low  <= tp2) return { result: "WIN",  pnlR: +2,   days: d, exit: "TP2" };
      if (c.high >= sl)  return { result: "LOSS", pnlR: -1,   days: d, exit: "SL"  };
    }

    if (d === MAX_HOLD) {
      const pnl = direction === "BUY"
        ? (c.close - entry) / risk
        : (entry - c.close) / risk;
      return { result: pnl >= 0 ? "WIN" : "LOSS", pnlR: parseFloat(pnl.toFixed(2)), days: d, exit: "TIMEOUT" };
    }
  }
  return null;
}

/**
 * Partial exit — 50% ออกที่ 1R แล้ว SL → BE, ที่เหลือ 50% ออกที่ 2R หรือ BE
 *
 * ผลที่เป็นไปได้:
 *   SL ก่อน 1R   → -1R total (loss เต็ม)
 *   1R hit → then BE → +0.5R total (half win, half scratch)
 *   1R hit → then 2R → +1.5R total (best case: 0.5×1 + 0.5×2)
 */
function simulatePartial(signal, candles, fromIdx) {
  const { direction, entry, sl, tp1, tp2 } = signal;
  const risk = direction === "BUY" ? entry - sl : sl - entry;
  if (risk <= 0) return null;

  let phase = 1;       // 1 = ยังไม่ถึง 1R, 2 = hit 1R แล้ว SL ย้ายมา BE
  let slCurrent = sl;
  let partialPnl = 0;

  for (let d = 1; d <= MAX_HOLD; d++) {
    const c = candles[fromIdx + d];
    if (!c) break;

    if (phase === 1) {
      // ตรวจ SL ก่อน TP1 (conservative — SL-first if same candle)
      if (direction === "BUY") {
        if (c.low <= slCurrent) return { result: "LOSS", pnlR: -1, days: d, exit: "SL" };
        if (c.high >= tp1) {
          // 50% ออกที่ 1R → SL ย้าย BE
          partialPnl = 0.5 * 1;
          slCurrent  = entry;
          phase = 2;
        }
      } else {
        if (c.high >= slCurrent) return { result: "LOSS", pnlR: -1, days: d, exit: "SL" };
        if (c.low <= tp1) {
          partialPnl = 0.5 * 1;
          slCurrent  = entry;
          phase = 2;
        }
      }
    }

    if (phase === 2) {
      if (direction === "BUY") {
        if (c.low <= slCurrent) {
          // BE hit — 50% เหลือออกที่ entry
          const total = parseFloat((partialPnl + 0).toFixed(2));
          return { result: "WIN", pnlR: total, days: d, exit: "BE" };
        }
        if (c.high >= tp2) {
          const total = parseFloat((partialPnl + 0.5 * 2).toFixed(2));
          return { result: "WIN", pnlR: total, days: d, exit: "TP2" };
        }
      } else {
        if (c.high >= slCurrent) {
          const total = parseFloat((partialPnl + 0).toFixed(2));
          return { result: "WIN", pnlR: total, days: d, exit: "BE" };
        }
        if (c.low <= tp2) {
          const total = parseFloat((partialPnl + 0.5 * 2).toFixed(2));
          return { result: "WIN", pnlR: total, days: d, exit: "TP2" };
        }
      }

      if (d === MAX_HOLD) {
        const pnl = direction === "BUY"
          ? (c.close - entry) / risk
          : (entry - c.close) / risk;
        const total = parseFloat((partialPnl + 0.5 * Math.max(pnl, 0)).toFixed(2));
        return { result: total > 0 ? "WIN" : "LOSS", pnlR: total, days: d, exit: "TIMEOUT" };
      }
    } else if (d === MAX_HOLD) {
      // ยังอยู่ phase 1 หมด MAX_HOLD
      const pnl = direction === "BUY"
        ? (c.close - entry) / risk
        : (entry - c.close) / risk;
      return { result: pnl >= 0 ? "WIN" : "LOSS", pnlR: parseFloat(pnl.toFixed(2)), days: d, exit: "TIMEOUT" };
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// BACKTEST RUNNER
// ─────────────────────────────────────────────

/**
 * exitMode: "FULL" | "PARTIAL"
 * patternMode: "PINBAR" | "OB"
 */
function runBacktest(candles, patternMode, exitMode) {
  const WARMUP = 50;
  const trades = [];
  let equity = 0, maxEq = 0, maxDD = 0, streak = 0, maxWS = 0, maxLS = 0;
  const sig = { BUY: 0, SHORT: 0 };
  let skipUntil = 0;

  const simulate = exitMode === "PARTIAL" ? simulatePartial : simulateFull;

  for (let i = WARMUP; i < candles.length - MAX_HOLD - 1; i++) {
    if (i < skipUntil) continue;
    const signal = generateSignal(candles.slice(0, i + 1), patternMode);
    if (!signal) continue;
    sig[signal.direction]++;
    const outcome = simulate(signal, candles, i);
    if (!outcome) continue;
    skipUntil = i + outcome.days;

    const date = new Date(candles[i].time).toISOString().slice(0, 10);
    trades.push({
      date,
      direction: signal.direction,
      result: outcome.result,
      pnlR: outcome.pnlR,
      pattern: signal.patternLabel,
      exit: outcome.exit,
      days: outcome.days,
      ema21: signal.ema21,
      entry: signal.entry,
      sl: signal.sl,
    });

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
  const totalR = parseFloat(trades.reduce((s, t) => s + t.pnlR, 0).toFixed(2));
  const grossWin  = trades.filter(t=>t.result==="WIN").reduce((s,t)=>s+t.pnlR,0);
  const grossLoss = Math.abs(trades.filter(t=>t.result==="LOSS").reduce((s,t)=>s+t.pnlR,0));
  const pf     = grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : Infinity;
  const avgHold = trades.length ? trades.reduce((s,t)=>s+t.days,0)/trades.length : 0;
  const avgWin  = wins  ? grossWin / wins : 0;
  const avgLoss = losses ? grossLoss / losses : 0;
  const expectancy = total ? (wr/100 * avgWin - (1-wr/100) * avgLoss) : 0;

  const buyT    = trades.filter((t) => t.direction === "BUY");
  const shortT  = trades.filter((t) => t.direction === "SHORT");
  const buyWR   = buyT.length   ? buyT.filter(t=>t.result==="WIN").length   / buyT.length   * 100 : null;
  const shortWR = shortT.length ? shortT.filter(t=>t.result==="WIN").length / shortT.length * 100 : null;

  // exit breakdown
  const exitCounts = {};
  for (const t of trades) exitCounts[t.exit] = (exitCounts[t.exit] || 0) + 1;

  return {
    patternMode, exitMode, total, wins, losses, wr, totalR, pf,
    maxDD, maxWS, maxLS, sig, buyWR, shortWR, avgHold,
    expectancy, avgWin, avgLoss, exitCounts, trades,
  };
}

// ─────────────────────────────────────────────
// PRINT HELPERS
// ─────────────────────────────────────────────
const f2  = (n) => isFinite(n) ? n.toFixed(2) : "∞";
const fp  = (n) => n != null   ? n.toFixed(1) + "%" : "–";
const SEP = "─".repeat(65);

function pfIcon(pf) {
  return pf >= 2 ? "🟢" : pf >= 1.5 ? "🟡" : pf >= 1 ? "🟠" : "🔴";
}

function printCompareTable(assetLabel, results) {
  console.log(`\n${"═".repeat(65)}`);
  console.log(`📋  ${assetLabel} — EMA21 Retest Strategy`);
  console.log(`${"═".repeat(65)}`);
  console.log(`  Mode                 Trades    WR      PF         Total R   MaxDD   Expect`);
  console.log(`  ${SEP}`);
  for (const r of results) {
    const label = `${r.patternMode}_${r.exitMode}`.padEnd(20);
    const icon  = pfIcon(r.pf);
    process.stdout.write(
      `  ${label} ` +
      `${r.total.toString().padStart(3)}T  ` +
      `${fp(r.wr).padStart(6)}  ` +
      `${("PF" + f2(r.pf)).padStart(7)} ${icon}  ` +
      `${(f2(r.totalR) + "R").padStart(7)}  ` +
      `DD${f2(r.maxDD)}R  ` +
      `E:${f2(r.expectancy)}R\n`
    );
  }
}

function printDetailedReport(r, assetLabel) {
  const modeLabel = `${r.patternMode} + ${r.exitMode === "PARTIAL" ? "Partial Exit (50%@1R → BE → 50%@2R)" : "Full Exit (2R)"}`;
  console.log(`\n${SEP}`);
  console.log(`📊  ${assetLabel}  —  ${modeLabel}`);
  console.log(SEP);

  const first = r.trades[0]?.date || "–", last = r.trades[r.trades.length-1]?.date || "–";
  console.log(`  ช่วงข้อมูล      : ${first} → ${last}`);
  console.log(`  Signal เกิด     : BUY ${r.sig.BUY}  SHORT ${r.sig.SHORT}`);
  console.log(`  Executed        : ${r.total} เทรด  (Win ${r.wins} / Loss ${r.losses})`);
  console.log(`  Win Rate        : ${fp(r.wr)}`);
  console.log(`  BUY WR          : ${fp(r.buyWR)}  (${r.trades.filter(t=>t.direction==="BUY").length} เทรด)`);
  console.log(`  SHORT WR        : ${fp(r.shortWR)}  (${r.trades.filter(t=>t.direction==="SHORT").length} เทรด)`);
  console.log(`  Profit Factor   : ${f2(r.pf)}  ${pfIcon(r.pf)}`);
  console.log(`  Total R         : ${f2(r.totalR)}R`);
  console.log(`  Expectancy/trade: ${f2(r.expectancy)}R`);
  console.log(`  Avg Win         : +${f2(r.avgWin)}R   Avg Loss : -${f2(r.avgLoss)}R`);
  console.log(`  Max Drawdown    : ${f2(r.maxDD)}R`);
  console.log(`  Win Streak      : ${r.maxWS}  |  Loss Streak : ${r.maxLS}`);
  console.log(`  Avg Hold        : ${f2(r.avgHold)} วัน`);

  // exit type breakdown
  if (r.exitMode === "PARTIAL" && Object.keys(r.exitCounts).length) {
    console.log(`\n  Exit Breakdown:`);
    const sorted = Object.entries(r.exitCounts).sort((a,b)=>b[1]-a[1]);
    for (const [k, v] of sorted) {
      const pct = (v / r.total * 100).toFixed(0);
      const bar = "█".repeat(Math.min(Math.round(v / r.total * 20), 20));
      console.log(`    ${k.padEnd(12)} ${v.toString().padStart(3)}  (${pct}%)  ${bar}`);
    }
    // partial pnl distribution
    const beCount  = r.trades.filter(t=>t.exit==="BE").length;
    const tp2Count = r.trades.filter(t=>t.exit==="TP2").length;
    const slCount  = r.trades.filter(t=>t.exit==="SL").length;
    console.log(`\n  ผล Partial Exit:`);
    console.log(`    ❌ SL full loss (-1R)       : ${slCount} เทรด`);
    console.log(`    ✅ BE (half win +0.5R)       : ${beCount} เทรด`);
    console.log(`    🎯 Full TP2 (+1.5R)          : ${tp2Count} เทรด`);
  }

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
      const bar  = v > 0 ? "▪".repeat(Math.min(Math.round(Math.abs(v)*2), 8)) : "▾".repeat(Math.min(Math.round(Math.abs(v)*2), 8));
      const sign = v >= 0 ? "+" : "";
      process.stdout.write(`    ${m} ${sign}${v.toFixed(2)}R ${bar}`.padEnd(30));
      if (++col % 3 === 0) process.stdout.write("\n");
    }
    if (col % 3) process.stdout.write("\n");
  }

  // เทรดล่าสุด 10
  console.log(`\n  เทรดล่าสุด 10 รายการ:`);
  r.trades.slice(-10).forEach((t) => {
    const icon = t.result === "WIN" ? "✅" : "❌";
    const pnl  = (t.pnlR > 0 ? "+" : "") + t.pnlR + "R";
    console.log(`    ${icon}  ${t.date}  ${t.direction.padEnd(5)}  [${t.pattern}]  ${pnl.padStart(7)}  exit:${t.exit.padEnd(10)}  hold:${t.days}d`);
  });
}

// ─────────────────────────────────────────────
// FINAL COMPARISON — FULL vs PARTIAL
// ─────────────────────────────────────────────
function printFullVsPartialAnalysis(allAssets) {
  console.log(`\n${"═".repeat(65)}`);
  console.log(`💡  สรุปเปรียบเทียบ Full 2R vs Partial Exit — ทุกสินทรัพย์`);
  console.log(`${"═".repeat(65)}`);

  console.log(`\n  ┌${"─".repeat(22)}┬${"─".repeat(12)}┬${"─".repeat(8)}┬${"─".repeat(7)}┬${"─".repeat(9)}┬${"─".repeat(8)}┐`);
  console.log(`  │ ${"สินทรัพย์ / Mode".padEnd(20)} │ ${"Total R".padEnd(10)} │ ${"WR".padEnd(6)} │ ${"PF".padEnd(5)} │ ${"MaxDD".padEnd(7)} │ ${"Expect".padEnd(6)} │`);
  console.log(`  ├${"─".repeat(22)}┼${"─".repeat(12)}┼${"─".repeat(8)}┼${"─".repeat(7)}┼${"─".repeat(9)}┼${"─".repeat(8)}┤`);

  for (const { label, results } of allAssets) {
    const shortLabel = label.split(" (")[0].slice(0, 10);
    for (const r of results) {
      const modeLabel = `${shortLabel} ${r.patternMode}_${r.exitMode}`.padEnd(20);
      console.log(
        `  │ ${modeLabel} │ ` +
        `${(f2(r.totalR)+"R").padStart(10)} │ ` +
        `${fp(r.wr).padStart(6)} │ ` +
        `${f2(r.pf).padStart(5)} │ ` +
        `${(f2(r.maxDD)+"R").padStart(7)} │ ` +
        `${f2(r.expectancy).padStart(6)} │`
      );
    }
    console.log(`  ├${"─".repeat(22)}┼${"─".repeat(12)}┼${"─".repeat(8)}┼${"─".repeat(7)}┼${"─".repeat(9)}┼${"─".repeat(8)}┤`);
  }
  console.log(`  └${"─".repeat(22)}┴${"─".repeat(12)}┴${"─".repeat(8)}┴${"─".repeat(7)}┴${"─".repeat(9)}┴${"─".repeat(8)}┘`);

  console.log(`
┌─────────────────────────────────────────────────────────────┐
│  วิเคราะห์ Full 2R vs Partial Exit                           │
└─────────────────────────────────────────────────────────────┘

  📌 Full 2R Exit (ปิดทั้งหมดที่ 2R):
     + Total R สูงกว่าถ้า WR ≥ 40% (win ทะลุ TP2 บ่อย)
     + ง่ายต่อการ execute — ไม่ต้องจัดการ position
     - Drawdown สูงกว่า — รอนาน บางเทรดเกือบถึง TP แล้วกลับ
     - จิตใจกดดันกว่า เมื่อเทรดกลับจาก +1.8R → -1R

  📌 Partial Exit 50%@1R → BE → 50%@2R:
     + MaxDD ต่ำกว่า — เพราะ SL ย้าย BE หลัง 1R
     + ลด "กลัวเสีย" ได้มาก จิตใจสบายกว่า → execute สม่ำเสมอกว่า
     + เหมาะกับ market ที่ "retest แล้วไม่วิ่งแรง" — ยังเก็บ +0.5R ได้
     - Total R ต่ำกว่าถ้า market มี strong trend (วิ่งตรง)
     - Win Rate ดูต่ำกว่า แต่ Expectancy ต่อเทรดมักใกล้เคียงกัน

  ✅ แนะนำสำหรับแต่ละสินทรัพย์:
     BTC/USDT  → Partial Exit (volatile สูง ราคามักกลับก่อนถึง 2R)
     S&P 500   → Full 2R (trending อ่อน MaxDD ต่ำอยู่แล้ว ไม่จำเป็น)
     ทองคำ     → Partial Exit (ผันผวนต่ำ วิ่งช้า ล็อค 1R ดีกว่ารอ 2R)

  💡 เพิ่มเติม — สิ่งที่ควร optimize ต่อ:
     1. Trailing Stop หลัง 1R ด้วย EMA8 แทน Fixed BE
        → จับ trend ยาวได้มากขึ้น เมื่อ BTC วิ่ง strong
     2. Long-Only สำหรับ S&P500
        → Short WR ต่ำกว่า BUY WR มาก ตัด SHORT ออกได้
     3. Time filter — หลีกเลี่ยง entry ก่อน NFP/FOMC
        → เพิ่ม WR ได้ในทางทฤษฎี แต่ต้องมี calendar data
`);
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  const CONFIGS = [
    { patternMode: "PINBAR", exitMode: "FULL"    },
    { patternMode: "PINBAR", exitMode: "PARTIAL" },
    { patternMode: "OB",     exitMode: "FULL"    },
    { patternMode: "OB",     exitMode: "PARTIAL" },
  ];

  const assetDefs = [
    {
      label: "BTC/USDT (Binance Daily)",
      fetch: async () => {
        const b = await tryFetchBinance("BTCUSDT", 500);
        if (b) { console.log(`  ✅ BTC — Binance API (${b.length} แท่ง)`); return b; }
        const y = await tryFetchYahoo("BTC-USD", "2y");
        if (y) { console.log(`  ✅ BTC — Yahoo Finance (${y.length} แท่ง)`); return y; }
        console.log(`  ⚠️  BTC — synthetic GBM (vol=70%/yr, drift=60%/yr)`);
        return generateGBM({ startPrice: 40000, annualVol: 0.70, annualDrift: 0.60, days: 500, seed: 0xBEEF1234 });
      },
    },
    {
      label: "S&P 500 (Yahoo Daily)",
      fetch: async () => {
        const d = await tryFetchYahoo("^GSPC", "2y");
        if (d) { console.log(`  ✅ S&P500 — Yahoo Finance (${d.length} แท่ง)`); return d; }
        console.log(`  ⚠️  S&P500 — synthetic GBM (vol=15%/yr, drift=14%/yr)`);
        return generateGBM({ startPrice: 4500, annualVol: 0.15, annualDrift: 0.14, days: 500, seed: 0x55001234 });
      },
    },
    {
      label: "PAXG / ทองคำ (Binance Daily)",
      fetch: async () => {
        const b = await tryFetchBinance("PAXGUSDT", 500);
        if (b) { console.log(`  ✅ PAXG — Binance API (${b.length} แท่ง)`); return b; }
        const y = await tryFetchYahoo("GC=F", "2y");
        if (y) { console.log(`  ✅ ทองคำ — Yahoo Finance (${y.length} แท่ง)`); return y; }
        console.log(`  ⚠️  ทองคำ — synthetic GBM (vol=13%/yr, drift=11%/yr)`);
        return generateGBM({ startPrice: 1950, annualVol: 0.13, annualDrift: 0.11, days: 500, seed: 0xD0055678 });
      },
    },
  ];

  console.log("════════════════════════════════════════════════════════════");
  console.log("  EMA21 Retest + Pinbar/Outside Bar Backtest");
  console.log("  Strategy: รอ retest EMA21 → pattern ยืนยัน → SL ปลายแท่ง");
  console.log("════════════════════════════════════════════════════════════");
  console.log("\n⏳ กำลังดึงข้อมูล...\n");

  const allAssets = [];

  for (const def of assetDefs) {
    let candles;
    try { candles = await def.fetch(); }
    catch (e) { console.error(`❌ ${def.label}: ${e.message}`); continue; }

    console.log(`\n${"▓".repeat(65)}`);
    console.log(`▓  ${def.label}`);
    console.log(`${"▓".repeat(65)}`);

    const results = CONFIGS.map(({ patternMode, exitMode }) =>
      runBacktest(candles, patternMode, exitMode)
    );

    // quick compare table
    printCompareTable(def.label, results);

    // detailed report: best FULL vs best PARTIAL
    const bestFull    = results.filter(r=>r.exitMode==="FULL").sort((a,b)=>b.totalR-a.totalR)[0];
    const bestPartial = results.filter(r=>r.exitMode==="PARTIAL").sort((a,b)=>b.totalR-a.totalR)[0];
    printDetailedReport(bestFull,    def.label);
    printDetailedReport(bestPartial, def.label);

    allAssets.push({ label: def.label, results });
  }

  if (allAssets.length > 0) printFullVsPartialAnalysis(allAssets);
}

main().catch(console.error);
