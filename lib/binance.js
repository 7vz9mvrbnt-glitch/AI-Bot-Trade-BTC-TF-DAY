// Fetches BTCUSDT daily candles from Binance public API (no API key needed)
const BINANCE_BASE = "https://data-api.binance.vision";

/**
 * @param {string} symbol  e.g. "BTCUSDT"
 * @param {number} limit   number of candles (default 50 for EMA21 warmup)
 * @returns {Promise<Array<{time,open,high,low,close,volume}>>}
 */
async function fetchCandles(symbol = "BTCUSDT", limit = 50) {
  const url = `${BINANCE_BASE}/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance fetch failed: ${res.status}`);
  const raw = await res.json();
  return raw.map((k) => ({
    time: new Date(k[0]).toISOString(),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

/**
 * Current 24h ticker price
 */
async function fetchPrice(symbol = "BTCUSDT") {
  const url = `${BINANCE_BASE}/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ticker failed: ${res.status}`);
  return res.json();
}

module.exports = { fetchCandles, fetchPrice };
