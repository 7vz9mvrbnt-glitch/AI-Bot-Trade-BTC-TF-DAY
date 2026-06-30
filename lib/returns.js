/**
 * คำนวณผลตอบแทนเฉลี่ย (CAGR) ของสินทรัพย์
 * Crypto (Binance): ย้อนหลัง 4 ปี · หุ้น/ETF (Yahoo): ย้อนหลัง 5 ปี
 * ใช้ weekly candle เพื่อให้ครอบคลุมช่วงที่ต้องการได้ในการ fetch ครั้งเดียว
 */

const { fetchKlines } = require("./binance");
const { fetchChart } = require("./yahoo");

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 ชั่วโมง — ราคาย้อนหลัง 5 ปีไม่เปลี่ยนบ่อย
const cache = new Map(); // symbol -> { data, expires }

async function getFiveYearReturn(symbol, source) {
  const cached = cache.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.data;

  try {
    const candles = source === "yahoo"
      ? await fetchChart(symbol, "5y", "1wk")
      : await fetchKlines(symbol, "1w", 212); // ~4 ปี (208 สัปดาห์) + buffer

    const result = computeCAGR(candles);
    cache.set(symbol, { data: result, expires: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (e) {
    console.error(`[returns] error (${symbol}):`, e.message);
    return null;
  }
}

function computeCAGR(candles) {
  if (!candles || candles.length < 20) return null;

  const first = candles[0];
  const last = candles[candles.length - 1];
  const startPrice = first.close;
  const endPrice = last.close;
  if (!startPrice || startPrice <= 0 || !endPrice) return null;

  const firstMs = typeof first.time === "number" ? first.time : new Date(first.time).getTime();
  const lastMs  = typeof last.time  === "number" ? last.time  : new Date(last.time).getTime();
  const years = (lastMs - firstMs) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 0.5) return null;

  const totalReturnPct = (endPrice / startPrice - 1) * 100;
  const cagrPct = (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100;

  return {
    years: Math.round(years * 10) / 10,
    cagrPct: Math.round(cagrPct * 10) / 10,
    totalReturnPct: Math.round(totalReturnPct * 10) / 10,
  };
}

module.exports = { getFiveYearReturn };
