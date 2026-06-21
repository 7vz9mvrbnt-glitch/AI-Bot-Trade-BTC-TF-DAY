/**
 * Technical analysis helpers
 * Input: array of candle objects [{close, high, low, ...}]
 */

function ema(closes, period) {
  const k = 2 / (period + 1);
  let val = closes[0];
  for (let i = 1; i < closes.length; i++) {
    val = closes[i] * k + val * (1 - k);
  }
  return val;
}

/**
 * Main analysis — returns a setup object ready to log to Google Sheet
 * Columns A–O: Datetime, Symbol, Trend, Price, EMA8, EMA21,
 *              EntryLow, EntryHigh, SL, Stop%, TP, TP%, Risk, Recommendation, Note
 */
function analyze(candles, symbol = "BTCUSDT") {
  if (candles.length < 22) throw new Error("Need at least 22 candles for EMA21");

  const closes = candles.map((c) => c.close);
  const latest = candles[candles.length - 1];

  const ema8Val  = parseFloat(ema(closes, 8).toFixed(2));
  const ema21Val = parseFloat(ema(closes, 21).toFixed(2));
  const price    = latest.close;

  // Trend: ema8 > ema21 → UP, else DOWN
  const trend = ema8Val > ema21Val ? "UP" : "DOWN";

  // Entry zone = last 3 candles low–high retracement (simple swing)
  const recent = candles.slice(-3);
  const entryLow  = parseFloat(Math.min(...recent.map((c) => c.low)).toFixed(2));
  const entryHigh = parseFloat(Math.max(...recent.map((c) => c.high)).toFixed(2));

  // SL = 1 ATR below entry low (ATR approx = avg range last 14)
  const atr = candles.slice(-14).reduce((s, c) => s + (c.high - c.low), 0) / 14;
  const sl  = parseFloat((entryLow - atr).toFixed(2));

  // TP = 2R above entry high
  const risk = parseFloat((entryLow - sl).toFixed(2));
  const tp   = parseFloat((entryHigh + risk * 2).toFixed(2));

  const stopPct = parseFloat((((entryLow - sl) / entryLow) * 100).toFixed(2));
  const tpPct   = parseFloat((((tp - entryHigh) / entryHigh) * 100).toFixed(2));

  // Recommendation
  let recommendation = "WAIT";
  if (trend === "UP" && price <= entryHigh && price >= entryLow) recommendation = "BUY";
  else if (trend === "DOWN" && price >= entryLow && price <= entryHigh) recommendation = "SHORT";
  else if (trend === "UP" && price > entryHigh) recommendation = "WATCH_PULLBACK";

  const note = `EMA8=${ema8Val} EMA21=${ema21Val} ATR=${parseFloat(atr.toFixed(2))}`;

  return {
    datetime:       new Date().toISOString(),
    symbol,
    trend,
    price,
    ema8:           ema8Val,
    ema21:          ema21Val,
    entryLow,
    entryHigh,
    sl,
    stopPct,
    tp,
    tpPct,
    risk,
    recommendation,
    note,
  };
}

/**
 * Convert setup object → ordered row array (A–O) for Google Sheets append
 */
function toSheetRow(setup) {
  return [
    setup.datetime,
    setup.symbol,
    setup.trend,
    setup.price,
    setup.ema8,
    setup.ema21,
    setup.entryLow,
    setup.entryHigh,
    setup.sl,
    setup.stopPct,
    setup.tp,
    setup.tpPct,
    setup.risk,
    setup.recommendation,
    setup.note,
  ];
}

module.exports = { analyze, toSheetRow, ema };
