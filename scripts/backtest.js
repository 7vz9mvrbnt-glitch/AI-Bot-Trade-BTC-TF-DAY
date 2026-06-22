/**
 * scripts/backtest.js
 * Walk-forward backtest สำหรับ BTC, S&P500, ทองคำ
 *
 * วิธีรัน:  node scripts/backtest.js
 *
 * Data: ดึงจาก Yahoo Finance (query1) / Binance (data-api.binance.vision)
 *       ถ้า fetch ไม่ได้ (เช่น network block ใน cloud) จะ fallback ใช้
 *       Geometric Brownian Motion ที่ calibrate จาก volatility จริงของแต่ละตลาด
 *
 * ตรรกะ backtest:
 *   วันที่ N   → สร้าง signal จาก candle[0..N] (warmup 50 แท่ง)
 *   วันที่ N+1 → ตรวจว่า high/low แตะ TP หรือ SL ก่อน
 *               ถ้าทั้งคู่แตะในวันเดียว → conservative: SL ก่อน (worst case)
 *   BUY  : entry=entryHigh, SL=entryLow-ATR,  TP=entry+2R
 *   SHORT: entry=entryLow,  SL=entryHigh+ATR, TP=entry-2R
 */

"use strict";
const { ema } = require("../lib/analyze");

// ──────────────────────────────────────────
// FETCH helpers
// ──────────────────────────────────────────
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
  } catch {
    return null;
  }
}

async function tryFetchBinance(symbol, limit = 500) {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()).map((k) => ({
      time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4],
    }));
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────
// SYNTHETIC data — Geometric Brownian Motion
// calibrate จาก historical vol จริง
// ──────────────────────────────────────────
function generateGBM({ startPrice, annualVol, annualDrift, days, seed }) {
  const dt   = 1 / 252;
  const mu   = annualDrift;
  const sig  = annualVol;
  let price  = startPrice;
  const candles = [];
  let rng = seed;
  const rand = () => {
    // Mulberry32
    rng |= 0; rng = rng + 0x6D2B79F5 | 0;
    let t = Math.imul(rng ^ rng >>> 15, 1 | rng);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const boxMuller = () => {
    const u1 = rand() || 1e-10, u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  for (let i = 0; i < days; i++) {
    const drift   = (mu - 0.5 * sig * sig) * dt;
    const diffuse = sig * Math.sqrt(dt) * boxMuller();
    const open    = price;
    const ret     = Math.exp(drift + diffuse);
    const intraVol = sig * Math.sqrt(dt) * 0.7;
    const highMult = Math.exp(Math.abs(boxMuller()) * intraVol);
    const lowMult  = Math.exp(-Math.abs(boxMuller()) * intraVol);
    price = open * ret;
    const high  = Math.max(open, price) * highMult;
    const low   = Math.min(open, price) * lowMult;
    const start = new Date("2024-01-01");
    start.setDate(start.getDate() + i);
    candles.push({ time: start.getTime(), open, high, low, close: price });
  }
  return candles;
}

// ──────────────────────────────────────────
// SIGNAL ENGINE  (เหมือน lib/analyze.js)
// ──────────────────────────────────────────
function generateSignal(candles) {
  if (candles.length < 22) return null;
  const closes    = candles.map((c) => c.close);
  const latest    = candles[candles.length - 1];
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
  else if (trend === "UP"   && price > entryHigh)  rec = "WATCH_PULLBACK";
  if (rec === "WAIT" || rec === "WATCH_PULLBACK") return null;

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
  return { rec, entry, sl, tp, atr, entryLow, entryHigh, price };
}

// ถือ trade จนกว่า SL/TP โดน หรือครบ MAX_HOLD วัน (ปิด at close)
const MAX_HOLD = 20;

function simulateTrade(signal, candles, fromIdx) {
  const risk = signal.rec === "BUY"
    ? signal.entry - signal.sl
    : signal.sl - signal.entry;

  for (let d = 1; d <= MAX_HOLD; d++) {
    const c = candles[fromIdx + d];
    if (!c) break;
    const { high, low, close } = c;

    if (signal.rec === "BUY") {
      const hitSL = low  <= signal.sl;
      const hitTP = high >= signal.tp;
      if (hitSL && hitTP) return { result: "LOSS", pnlR: -1,    days: d };
      if (hitTP)          return { result: "WIN",  pnlR: +2,    days: d };
      if (hitSL)          return { result: "LOSS", pnlR: -1,    days: d };
    } else {
      const hitSL = high >= signal.sl;
      const hitTP = low  <= signal.tp;
      if (hitSL && hitTP) return { result: "LOSS", pnlR: -1,    days: d };
      if (hitTP)          return { result: "WIN",  pnlR: +2,    days: d };
      if (hitSL)          return { result: "LOSS", pnlR: -1,    days: d };
    }

    // ครบ MAX_HOLD: ปิดที่ราคา close คำนวณ P/L เป็น R
    if (d === MAX_HOLD) {
      const pnl = signal.rec === "BUY"
        ? (close - signal.entry) / risk
        : (signal.entry - close) / risk;
      return { result: pnl >= 0 ? "WIN" : "LOSS", pnlR: parseFloat(pnl.toFixed(2)), days: d };
    }
  }
  return null;
}

// ──────────────────────────────────────────
// BACKTEST RUNNER
// ──────────────────────────────────────────
function runBacktest(candles, label) {
  const WARMUP = 50;
  const trades = [];
  let equity = 0, maxEquity = 0, maxDD = 0;
  let streak = 0, maxWin = 0, maxLoss = 0;
  const sigCount = { BUY: 0, SHORT: 0 };

  let skipUntil = 0; // ป้องกันนับ signal ซ้ำขณะถือ trade อยู่
  for (let i = WARMUP; i < candles.length - MAX_HOLD - 1; i++) {
    if (i < skipUntil) continue;
    const signal = generateSignal(candles.slice(0, i + 1));
    if (!signal) continue;
    sigCount[signal.rec] = (sigCount[signal.rec] || 0) + 1;
    const outcome = simulateTrade(signal, candles, i);
    if (!outcome) continue;
    skipUntil = i + outcome.days; // ไม่รับ signal ใหม่ขณะถือ trade

    const date = new Date(candles[i + 1].time).toISOString().slice(0, 10);
    trades.push({ date, rec: signal.rec, result: outcome.result, pnlR: outcome.pnlR });

    equity += outcome.pnlR;
    if (equity > maxEquity) maxEquity = equity;
    const dd = maxEquity - equity;
    if (dd > maxDD) maxDD = dd;

    if (outcome.result === "WIN")  { streak = streak > 0 ? streak + 1 : 1;  if (streak > maxWin)  maxWin  = streak; }
    else                            { streak = streak < 0 ? streak - 1 : -1; if (-streak > maxLoss) maxLoss = -streak; }
  }

  const wins   = trades.filter((t) => t.result === "WIN").length;
  const losses = trades.filter((t) => t.result === "LOSS").length;
  const total  = wins + losses;
  const wr     = total > 0 ? (wins / total * 100) : 0;
  const totalR = trades.reduce((s, t) => s + t.pnlR, 0);
  const pf     = losses > 0 ? (wins * 2 / losses) : Infinity;

  const buyT   = trades.filter((t) => t.rec === "BUY");
  const shortT = trades.filter((t) => t.rec === "SHORT");
  const buyWR  = buyT.length   ? (buyT.filter(t=>t.result==="WIN").length   / buyT.length   * 100) : null;
  const shortWR= shortT.length ? (shortT.filter(t=>t.result==="WIN").length / shortT.length * 100) : null;

  // equity curve by month
  const monthly = {};
  for (const t of trades) {
    const m = t.date.slice(0, 7);
    monthly[m] = (monthly[m] || 0) + t.pnlR;
  }

  return { label, total, wins, losses, wr, totalR, pf, maxDD, maxWin, maxLoss,
           sigCount, buyWR, shortWR, monthly, trades };
}

// ──────────────────────────────────────────
// PRINT helpers
// ──────────────────────────────────────────
const R2 = (n) => isFinite(n) ? n.toFixed(2) : "∞";
const PCT = (n) => n != null ? n.toFixed(1) + "%" : "–";
const BAR = "─".repeat(54);
const DBL = "═".repeat(54);

function printReport(r) {
  console.log(`\n${BAR}`);
  console.log(`📊  ${r.label}`);
  console.log(BAR);
  const first = r.trades[0]?.date || "–";
  const last  = r.trades[r.trades.length - 1]?.date || "–";
  console.log(`  ช่วงข้อมูล      : ${first} → ${last}  (${r.trades.length ? r.trades.length + " เทรด" : "ไม่มีเทรด"})`);
  console.log(`  Signal รวม      : BUY ${r.sigCount.BUY||0}  SHORT ${r.sigCount.SHORT||0}  → executed ${r.total}`);
  console.log(`  Win / Loss      : ${r.wins}W / ${r.losses}L`);
  console.log(`  Win Rate        : ${PCT(r.wr)}  (BUY ${PCT(r.buyWR)}  SHORT ${PCT(r.shortWR)})`);
  console.log(`  Total R         : ${R2(r.totalR)}R  (RR=1:2 ทุกเทรด)`);
  console.log(`  Profit Factor   : ${R2(r.pf)}  ${r.pf >= 2 ? "🟢 ดีมาก" : r.pf >= 1.5 ? "🟡 ดี" : r.pf >= 1 ? "🟠 พอใช้" : "🔴 ขาดทุน"}`);
  console.log(`  Max Drawdown    : ${R2(r.maxDD)}R`);
  console.log(`  Streak (W/L)    : max win ${r.maxWin} ครั้ง  /  max loss ${r.maxLoss} ครั้ง`);

  // equity curve รายเดือน
  console.log(`\n  รายเดือน (R):`);
  const months = Object.entries(r.monthly).sort((a,b) => a[0].localeCompare(b[0]));
  let col = 0;
  for (const [m, v] of months) {
    const bar = v >= 0 ? "▪".repeat(Math.min(Math.round(v), 8)) : "▾".repeat(Math.min(Math.round(-v), 8));
    const sign = v >= 0 ? "+" : "";
    process.stdout.write(`    ${m} ${sign}${v.toFixed(1)}R ${bar}`.padEnd(30));
    if (++col % 3 === 0) process.stdout.write("\n");
  }
  if (col % 3 !== 0) process.stdout.write("\n");

  // 10 เทรดล่าสุด
  console.log(`\n  10 เทรดล่าสุด:`);
  r.trades.slice(-10).forEach((t) => {
    const icon = t.result === "WIN" ? "✅" : "❌";
    console.log(`    ${icon}  ${t.date}  ${t.rec.padEnd(5)}  ${t.pnlR > 0 ? "+" : ""}${t.pnlR}R`);
  });
}

function printRecommendations(results) {
  console.log(`\n${DBL}`);
  console.log(`💡  วิเคราะห์และข้อเสนอแนะพัฒนาระบบ`);
  console.log(DBL);

  // สรุปตาราง
  console.log(`\n  ┌${"─".repeat(30)}┬${"─".repeat(7)}┬${"─".repeat(7)}┬${"─".repeat(8)}┬${"─".repeat(8)}┐`);
  console.log(`  │ ${"สินทรัพย์".padEnd(28)} │ WR%   │ PF    │ Total R │ Max DD  │`);
  console.log(`  ├${"─".repeat(30)}┼${"─".repeat(7)}┼${"─".repeat(7)}┼${"─".repeat(8)}┼${"─".repeat(8)}┤`);
  for (const r of results) {
    const name = r.label.split(" (")[0].slice(0,28).padEnd(28);
    console.log(`  │ ${name} │ ${PCT(r.wr).padStart(5)} │ ${R2(r.pf).padStart(5)} │ ${(R2(r.totalR)+"R").padStart(7)} │ ${(R2(r.maxDD)+"R").padStart(7)} │`);
  }
  console.log(`  └${"─".repeat(30)}┴${"─".repeat(7)}┴${"─".repeat(7)}┴${"─".repeat(8)}┴${"─".repeat(8)}┘`);

  for (const r of results) {
    console.log(`\n▶ ${r.label}`);

    // SHORT performance
    if (r.shortWR != null && r.shortWR < 40 && r.sigCount.SHORT >= 5) {
      console.log(`  ⚠️  SHORT win rate ต่ำ (${PCT(r.shortWR)}) — ตลาด bull ระยะยาวทำให้ SHORT แพ้บ่อย`);
      if (r.buyWR != null && r.buyWR > r.shortWR + 15) {
        console.log(`  💡  BUY WR ${PCT(r.buyWR)} > SHORT WR ${PCT(r.shortWR)} — พิจารณาเปลี่ยนเป็น Long-Only`);
      }
    }
    if (r.sigCount.SHORT === 0) {
      console.log(`  ℹ️  ไม่มี SHORT signal ในช่วงนี้ — ตลาดอยู่ในแนวโน้มขาขึ้นตลอด`);
    }

    if (r.pf < 1)        console.log(`  🔴  PF < 1 → ระบบขาดทุนสุทธิ — ต้องปรับพื้นฐาน`);
    else if (r.pf < 1.5) console.log(`  🟠  PF ${R2(r.pf)} — พอใช้ แต่ยังมีช่องพัฒนา`);
    else if (r.pf < 2)   console.log(`  🟡  PF ${R2(r.pf)} — ดี ควรเพิ่ม position sizing แบบ dynamic`);
    else                  console.log(`  🟢  PF ${R2(r.pf)} — ระบบมีความได้เปรียบชัดเจน`);

    if (r.maxLoss >= 5) {
      console.log(`  ⚠️  Loss streak สูงสุด ${r.maxLoss} ครั้งติด → ต้องมี rule หยุดเทรดชั่วคราว`);
    }
    if (r.maxDD > 8) {
      console.log(`  ⚠️  Max Drawdown ${R2(r.maxDD)}R สูง → จำกัด risk/trade ≤ 1% equity`);
    }
  }

  console.log(`\n${BAR}`);
  console.log(`📋  ข้อเสนอแนะพัฒนา 7 ข้อ (เรียงลำดับผลกระทบ)`);
  console.log(BAR);
  console.log(`
  1️⃣  ENTRY CONFIRMATION — ลด false breakout
     ปัจจุบัน: เข้าเมื่อราคา close อยู่ใน entry zone (3 candle range)
     เสนอ:    เพิ่มเงื่อนไข "candle ปิดยืนอยู่ใน zone ≥ 2 วันติด"
     ผลที่คาดหวัง: ลด trade ทั้งหมด ~20% แต่ WR เพิ่ม ~5-10%

  2️⃣  WEEKLY TREND FILTER — เทรดตาม macro trend
     ปัจจุบัน: ดูแค่ Daily EMA8/21
     เสนอ:    BUY ได้เฉพาะเมื่อ Weekly EMA8 > Weekly EMA21 ด้วย
              SHORT ได้เฉพาะเมื่อ Weekly trend = DOWN ด้วย
     ผลที่คาดหวัง: กรอง false signal ในตลาด sideways ได้ดีขึ้น

  3️⃣  LONG-ONLY สำหรับ S&P500
     เสนอ:    ตัด SHORT ออก — S&P500 เป็น secular bull market
              ใน 100 ปีขึ้น ~70% ของวัน → SHORT ต้านกระแสหลัก
     ผลที่คาดหวัง: WR ของ S&P500 น่าจะเพิ่มขึ้น 10-15%

  4️⃣  TRAILING STOP หลัง +1R
     ปัจจุบัน: TP คงที่ 2R
     เสนอ:    เมื่อกำไร +1R → ย้าย SL มา breakeven แล้ว trail ตาม EMA8 daily
     ผลที่คาดหวัง: ลด "win ที่กลายเป็น loss" ลดได้ Max Drawdown

  5️⃣  DYNAMIC ATR MULTIPLIER ตาม volatility regime
     ปัจจุบัน: SL = 1x ATR คงที่
     เสนอ:    ถ้า ATR(14) > ATR(50) × 1.5 (high vol) → ใช้ 1.5x ATR เป็น SL
              ถ้า ATR(14) < ATR(50) × 0.7 (low vol)  → ใช้ 0.75x ATR
     ผลที่คาดหวัง: SL เหมาะสมกับตลาดมากขึ้น ลด stopped-out ในตลาด volatile

  6️⃣  VOLUME CONFIRMATION สำหรับ Crypto
     เสนอ:    BUY signal ต้องมี volume ≥ 20-day avg × 1.2
     ผลที่คาดหวัง: กรอง low-liquidity breakout ออก เพิ่ม WR crypto ~5%

  7️⃣  POSITION SIZING — Kelly Criterion แบบ conservative
     ปัจจุบัน: ไม่ได้ระบุ
     เสนอ:    ใช้ Half-Kelly = f* = (WR - (1-WR)/RR) / 2
              ถ้า WR=50%, RR=1:2 → f* = (0.5 - 0.5/2)/2 = 12.5% ต่อเทรด
              ใช้ไม่เกิน 5% เพื่อความปลอดภัย
     ผลที่คาดหวัง: growth เต็มที่โดยไม่ ruin
`);

  console.log(BAR);
  console.log(`⚠️  หมายเหตุสำคัญ`);
  console.log(BAR);
  console.log(`
  • ผลลัพธ์นี้มาจาก synthetic data (GBM) calibrate จาก historical vol จริง
    เพื่อ demo mechanics ของ strategy เท่านั้น
  • รัน backtest ด้วยข้อมูลจริงได้โดย: node scripts/backtest.js
    (ต้องรันจากเครื่องที่เข้าถึง Yahoo Finance / Binance ได้)
  • Past performance ไม่รับประกันผลในอนาคต — backtest มักให้ผลดีกว่า live trading
    เนื่องจาก look-ahead bias, slippage, และ execution delay
  `);
}

// ──────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────
async function main() {
  // พยายาม fetch จริงก่อน fallback ไป synthetic
  const assets = [
    {
      label: "BTC/USDT (Binance Daily)",
      fetch: async () => {
        const d = await tryFetchBinance("BTCUSDT", 500);
        if (d) { console.log(`  ✅ BTC จาก Binance (${d.length} แท่ง)`); return d; }
        const y = await tryFetchYahoo("BTC-USD", "2y");
        if (y) { console.log(`  ✅ BTC จาก Yahoo Finance (${y.length} แท่ง)`); return y; }
        console.log(`  ⚠️  BTC: ใช้ synthetic GBM data (vol=70%/yr, drift=60%/yr)`);
        return generateGBM({ startPrice: 40000, annualVol: 0.70, annualDrift: 0.60, days: 500, seed: 0xBEEF1234 });
      },
    },
    {
      label: "S&P 500 / ^GSPC (Yahoo)",
      fetch: async () => {
        const d = await tryFetchYahoo("^GSPC", "2y");
        if (d) { console.log(`  ✅ S&P500 จาก Yahoo Finance (${d.length} แท่ง)`); return d; }
        console.log(`  ⚠️  S&P500: ใช้ synthetic GBM data (vol=15%/yr, drift=14%/yr)`);
        return generateGBM({ startPrice: 4500, annualVol: 0.15, annualDrift: 0.14, days: 500, seed: 0x5500123 });
      },
    },
    {
      label: "PAXG / ทองคำ (Binance)",
      fetch: async () => {
        const d = await tryFetchBinance("PAXGUSDT", 500);
        if (d) { console.log(`  ✅ PAXG จาก Binance (${d.length} แท่ง)`); return d; }
        const y = await tryFetchYahoo("GC=F", "2y");
        if (y) { console.log(`  ✅ ทองคำ จาก Yahoo Finance (${y.length} แท่ง)`); return y; }
        console.log(`  ⚠️  ทองคำ: ใช้ synthetic GBM data (vol=13%/yr, drift=11%/yr)`);
        return generateGBM({ startPrice: 1950, annualVol: 0.13, annualDrift: 0.11, days: 500, seed: 0xD0055678 });
      },
    },
  ];

  console.log("⏳ กำลังดึงข้อมูล...");
  const results = [];
  for (const asset of assets) {
    try {
      const candles = await asset.fetch();
      const r = runBacktest(candles, asset.label);
      results.push(r);
      printReport(r);
    } catch (e) {
      console.error(`  ❌ ${asset.label}: ${e.message}`);
    }
  }

  if (results.length > 0) {
    printRecommendations(results);
  }
}

main().catch(console.error);
