/**
 * Backtest: BTC/USDT Daily — ใช้ logic เดียวกับบอทจริง
 */

const { analyze } = require("../lib/analyze");

const WARMUP           = 160;
const CAPITAL_THB      = 10000;
const THB_PER_USD      = 35.7;
const CAPITAL_USD      = CAPITAL_THB / THB_PER_USD;
const POSITION_SIZE_PCT = 0.5;
const COMMISSION       = 0.001;
const MAX_HOLD_DAYS    = 20;

async function fetchCandles(days = 530) {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const raw = await res.json();
  return raw.map((k) => ({
    time:   new Date(k[0]).toISOString().slice(0, 10),
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

function runBacktest(candles) {
  let equity   = CAPITAL_USD;
  let position = null;
  const trades = [];
  let wins = 0, losses = 0, peakEquity = equity, maxDrawdown = 0;

  for (let i = WARMUP; i < candles.length - 1; i++) {
    const today   = candles[i];
    const nextDay = candles[i + 1];

    // ── ตรวจ position ที่เปิดอยู่ ─────────────────────────────────────
    if (position) {
      const { type, entry, sl, tp, size, btcQty, openDate, openIdx } = position;
      let exitPrice = null, exitReason = null;
      const daysHeld = i - openIdx;

      if (type === "BUY") {
        if (nextDay.low <= sl)       { exitPrice = sl;       exitReason = "SL 🔴"; }
        else if (nextDay.high >= tp) { exitPrice = tp;       exitReason = "TP ✅"; }
        else if (daysHeld >= MAX_HOLD_DAYS) { exitPrice = nextDay.open; exitReason = "TIMEOUT"; }
      } else {
        if (nextDay.high >= sl)      { exitPrice = sl;       exitReason = "SL 🔴"; }
        else if (nextDay.low <= tp)  { exitPrice = tp;       exitReason = "TP ✅"; }
        else if (daysHeld >= MAX_HOLD_DAYS) { exitPrice = nextDay.open; exitReason = "TIMEOUT"; }
      }

      if (exitPrice) {
        const pnlPerUnit = type === "BUY" ? exitPrice - entry : entry - exitPrice;
        const grossPnl   = pnlPerUnit * btcQty;
        const fee        = exitPrice * btcQty * COMMISSION;
        const netPnl     = grossPnl - fee;
        equity += netPnl;
        if (netPnl > 0) wins++; else losses++;
        if (equity > peakEquity) peakEquity = equity;
        const dd = ((peakEquity - equity) / peakEquity) * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
        trades.push({
          n:        trades.length + 1,
          type,
          openDate,
          closeDate: nextDay.time,
          daysHeld,
          entry:    entry.toFixed(0),
          exit:     exitPrice.toFixed(0),
          sl:       sl.toFixed(0),
          tp:       tp.toFixed(0),
          pnlPct:   ((netPnl / size) * 100).toFixed(1),
          netUSD:   netPnl.toFixed(1),
          reason:   exitReason,
          equity:   equity.toFixed(1),
        });
        position = null;
      }
    }

    // ── ตรวจสัญญาณใหม่ ────────────────────────────────────────────────
    if (!position) {
      const setup = analyze(candles.slice(0, i + 1), "BTCUSDT", "binance", null);
      const rec   = setup.recommendation;

      if (rec === "BUY" || rec === "SHORT") {
        const execPrice = nextDay.open;
        const sl        = setup.sl;
        const tp        = setup.tp;

        if (!sl || !tp || execPrice <= 0) continue;
        if (rec === "BUY"   && sl >= execPrice) continue;
        if (rec === "SHORT" && sl <= execPrice) continue;

        const size    = equity * POSITION_SIZE_PCT;
        const btcQty  = size / execPrice;
        const fee     = execPrice * btcQty * COMMISSION;
        equity -= fee;

        position = { type: rec, entry: execPrice, sl, tp, size, btcQty,
                     openDate: nextDay.time, openIdx: i + 1 };
      }
    }
  }

  // ปิด position ที่ค้างอยู่
  if (position) {
    const last = candles[candles.length - 1];
    const { type, entry, btcQty, size, openDate, openIdx } = position;
    const pnl = (type === "BUY" ? last.close - entry : entry - last.close) * btcQty
                - last.close * btcQty * COMMISSION;
    equity += pnl;
    if (pnl > 0) wins++; else losses++;
    trades.push({
      n: trades.length + 1, type, openDate, closeDate: last.time,
      daysHeld: candles.length - 1 - openIdx,
      entry: entry.toFixed(0), exit: last.close.toFixed(0),
      sl: position.sl.toFixed(0), tp: position.tp.toFixed(0),
      pnlPct: ((pnl / size) * 100).toFixed(1), netUSD: pnl.toFixed(1),
      reason: "END", equity: equity.toFixed(1),
    });
  }

  return {
    trades,
    wins, losses,
    total:       trades.length,
    winRate:     trades.length ? ((wins / trades.length) * 100).toFixed(1) : 0,
    maxDrawdown: maxDrawdown.toFixed(1),
    endEquity:   equity,
    returnPct:   (((equity - CAPITAL_USD) / CAPITAL_USD) * 100).toFixed(1),
    endTHB:      (equity * THB_PER_USD).toFixed(0),
    returnTHB:   ((equity - CAPITAL_USD) * THB_PER_USD).toFixed(0),
  };
}

async function main() {
  console.log("⏳ ดึงข้อมูล BTC/USDT 530 วัน...\n");
  const all     = await fetchCandles(530);
  const candles = all.slice(-(365 + WARMUP));

  const tradingStart = candles[WARMUP].time;
  const tradingEnd   = candles[candles.length - 1].time;
  const btcStart     = candles[WARMUP].close;
  const btcEnd       = candles[candles.length - 1].close;

  console.log(`📅 ช่วง: ${tradingStart} → ${tradingEnd}`);
  console.log(`💰 ทุนเริ่ม: ${CAPITAL_THB.toLocaleString()} THB  (~$${CAPITAL_USD.toFixed(0)} USD @ ${THB_PER_USD} THB/USD)`);
  console.log(`📐 Rules: Position=50% equity | SL/TP=ATR-based (R:R ~1:2) | Max hold=${MAX_HOLD_DAYS} วัน | Fee=${COMMISSION*100}%/side\n`);

  const r = runBacktest(candles);

  // ── ตารางรายการ Trade ──
  console.log("┌─────────────────────────────────────────────────────────────────────────────────────────┐");
  console.log("│                             รายการ Trade ทั้งหมด                                       │");
  console.log("├───┬────────────┬────────────┬───────┬─────────┬─────────┬──────────┬──────────┬────────┤");
  console.log("│ # │ เข้า       │ ออก        │ Type  │ Entry   │ Exit    │ SL/TP    │ P&L      │ Equity │");
  console.log("├───┼────────────┼────────────┼───────┼─────────┼─────────┼──────────┼──────────┼────────┤");
  for (const t of r.trades) {
    const pnl = parseFloat(t.pnlPct);
    const tag = pnl >= 0 ? "✅" : "❌";
    console.log(
      `│${String(t.n).padStart(2)} │ ${t.openDate} │ ${t.closeDate} │ ${t.type.padEnd(5)} │` +
      `$${t.entry.padStart(6)} │ $${t.exit.padStart(6)} │ ${t.sl}/${t.tp.padEnd(7)} │` +
      ` ${tag}${pnl >= 0 ? "+" : ""}${t.pnlPct.padStart(5)}% │ $${t.equity.padStart(5)} │`
    );
  }
  console.log("└───┴────────────┴────────────┴───────┴─────────┴─────────┴──────────┴──────────┴────────┘\n");

  // ── สรุป ──
  const returnSign = parseFloat(r.returnPct) >= 0 ? "+" : "";
  const holdReturn = ((btcEnd - btcStart) / btcStart * 100).toFixed(1);
  const holdTHB    = (CAPITAL_USD * (btcEnd / btcStart) * THB_PER_USD).toFixed(0);

  console.log("═══════════════════════════════════════════════════");
  console.log("  📊 สรุปผล Backtest — Bot Strategy");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  ทุนเริ่มต้น    : ${CAPITAL_THB.toLocaleString().padStart(8)} THB`);
  console.log(`  ทุนสุดท้าย    : ${Number(r.endTHB).toLocaleString().padStart(8)} THB`);
  console.log(`  กำไร/ขาดทุน   : ${(returnSign + Number(r.returnTHB).toLocaleString()).padStart(8)} THB (${returnSign}${r.returnPct}%)`);
  console.log(`  Win Rate       : ${r.winRate}%  (${r.wins}W / ${r.losses}L / ${r.total} trades)`);
  console.log(`  Max Drawdown   : -${r.maxDrawdown}%`);
  console.log("───────────────────────────────────────────────────");
  console.log(`  📈 Buy & Hold BTC ช่วงเดียวกัน`);
  console.log(`  BTC: $${btcStart.toLocaleString()} → $${btcEnd.toLocaleString()} (${holdReturn >= 0 ? "+" : ""}${holdReturn}%)`);
  console.log(`  ผลลัพธ์ B&H   : ~${Number(holdTHB).toLocaleString()} THB`);
  console.log("═══════════════════════════════════════════════════");
  console.log(`\n⚠️  หมายเหตุ: ผล backtest ไม่รับประกันอนาคต`);
  console.log(`   Slippage / spread ไม่รวมในการคำนวณ`);
  console.log(`   Daily TF → สัญญาณช้ากว่า intraday 1-2 วัน`);
}

main().catch(console.error);
