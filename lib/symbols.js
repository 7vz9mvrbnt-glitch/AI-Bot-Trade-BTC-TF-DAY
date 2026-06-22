/**
 * รายการ symbol ทั้งหมด — crypto (Binance) และหุ้น/Index (Yahoo Finance)
 * source: "binance" | "yahoo"
 */
const SYMBOLS = [
  // ── Crypto (Binance) ──────────────────────────────────────────
  { symbol: "BTCUSDT",  source: "binance", displayName: "BTC/USDT",  keywords: ["btc", "bitcoin", "บิตคอยน์", "บีทีซี"] },
  { symbol: "ETHUSDT",  source: "binance", displayName: "ETH/USDT",  keywords: ["eth", "ethereum", "อีเธอร์"] },
  { symbol: "BNBUSDT",  source: "binance", displayName: "BNB/USDT",  keywords: ["bnb", "binance coin", "บีเอ็นบี"] },
  { symbol: "XRPUSDT",  source: "binance", displayName: "XRP/USDT",  keywords: ["xrp", "ripple", "ริปเปิล"] },
  { symbol: "SOLUSDT",  source: "binance", displayName: "SOL/USDT",  keywords: ["sol", "solana", "โซลานา"] },
  { symbol: "PAXGUSDT", source: "binance", displayName: "PAXG/USDT", keywords: ["paxg", "pax gold", "แพ็กซ์โกลด์", "gold", "ทอง"] },

  // ── Magnificent 7 (Yahoo Finance) ─────────────────────────────
  { symbol: "AAPL",  source: "yahoo", displayName: "AAPL · Apple",   keywords: ["aapl", "apple", "แอปเปิล"] },
  { symbol: "MSFT",  source: "yahoo", displayName: "MSFT · Microsoft", keywords: ["msft", "microsoft", "ไมโครซอฟต์"] },
  { symbol: "NVDA",  source: "yahoo", displayName: "NVDA · Nvidia",  keywords: ["nvda", "nvidia", "เอ็นวิเดีย"] },
  { symbol: "GOOGL", source: "yahoo", displayName: "GOOGL · Google", keywords: ["googl", "google", "กูเกิล"] },
  { symbol: "AMZN",  source: "yahoo", displayName: "AMZN · Amazon",  keywords: ["amzn", "amazon", "อเมซอน"] },
  { symbol: "META",  source: "yahoo", displayName: "META · Meta",    keywords: ["meta", "facebook", "เฟซบุ๊ก"] },
  { symbol: "TSLA",  source: "yahoo", displayName: "TSLA · Tesla",   keywords: ["tsla", "tesla", "เทสลา"] },

  // ── Index (Yahoo Finance) ──────────────────────────────────────
  { symbol: "^GSPC", source: "yahoo", displayName: "S&P 500",     keywords: ["s&p", "sp500", "s&p500", "snp", "เอสแอนด์พี"] },
  { symbol: "^NDX",  source: "yahoo", displayName: "NASDAQ 100",  keywords: ["nasdaq", "ndx", "แนสแด็ก", "nasdaq100"] },
];

/**
 * หา entry จาก text ที่ผู้ใช้พิมพ์
 * คืน { symbol, source, displayName } หรือ null
 */
function detectSymbol(text) {
  const lower = text.toLowerCase();
  // BTC เป็น default ถ้าพิมพ์ "setup" หรือ "วิเคราะห์" โดยไม่ระบุเหรียญ/หุ้น
  if (["setup", "วิเคราะห์"].some((kw) => lower.includes(kw))) {
    return SYMBOLS.find((s) => s.symbol === "BTCUSDT");
  }
  return SYMBOLS.find(({ keywords }) => keywords.some((kw) => lower.includes(kw))) || null;
}

module.exports = { SYMBOLS, detectSymbol };
