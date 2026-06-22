/**
 * Yahoo Finance candle fetcher — ใช้สำหรับหุ้นและ Index
 * ไม่ต้อง API key, ข้อมูล Daily TF delay ~15 นาที
 */

async function fetchCandles(symbol, limit = 50) {
  // ดึง 3 เดือนย้อนหลังเพื่อให้ได้ candle เพียงพอสำหรับ EMA21
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Yahoo Finance fetch failed ${res.status} for ${symbol}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No data from Yahoo Finance for ${symbol}`);

  const timestamps = result.timestamp;
  if (!timestamps || !timestamps.length) throw new Error(`No candle data from Yahoo Finance for ${symbol}`);
  const q = result.indicators.quote[0];

  const candles = timestamps.map((ts, i) => ({
    time:  ts * 1000,
    open:  q.open[i],
    high:  q.high[i],
    low:   q.low[i],
    close: q.close[i],
    volume: q.volume[i],
  })).filter((c) => c.close != null);

  return candles.slice(-limit);
}

module.exports = { fetchCandles };
