/**
 * รายการ symbol ทั้งหมด — crypto (Binance) และหุ้น/Index (Yahoo Finance)
 * source: "binance" | "yahoo"
 * tradeNote: คำอธิบายสั้นว่าเหมาะกับการเทรดแบบไหน
 */
const SYMBOLS = [
  // ── Crypto (Binance) ──────────────────────────────────────────
  {
    symbol: "BTCUSDT", source: "binance", displayName: "BTC/USDT",
    tradeNote: "Futures · ผันผวนสูง · เหมาะ Swing & Day Trade",
    keywords: ["btc", "bitcoin", "บิตคอยน์", "บีทีซี"],
  },
  {
    symbol: "ETHUSDT", source: "binance", displayName: "ETH/USDT",
    tradeNote: "Futures · ผันผวนสูง · เหมาะ Swing Trade",
    keywords: ["eth", "ethereum", "อีเธอร์"],
  },
  {
    symbol: "BNBUSDT", source: "binance", displayName: "BNB/USDT",
    tradeNote: "Futures/Spot · ผันผวนปานกลาง · เหมาะ Swing Trade",
    keywords: ["bnb", "binance coin", "บีเอ็นบี"],
  },
  {
    symbol: "XRPUSDT", source: "binance", displayName: "XRP/USDT",
    tradeNote: "Futures/Spot · ผันผวนสูง · เหมาะ Day & Swing Trade",
    keywords: ["xrp", "ripple", "ริปเปิล"],
  },
  {
    symbol: "SOLUSDT", source: "binance", displayName: "SOL/USDT",
    tradeNote: "Futures · ผันผวนสูงมาก · เหมาะ Day Trade",
    keywords: ["sol", "solana", "โซลานา"],
  },
  {
    symbol: "PAXGUSDT", source: "binance", displayName: "PAXG/USDT",
    tradeNote: "Spot · ผันผวนต่ำ · เหมาะ Position Trade (ป้องกันความเสี่ยง)",
    keywords: ["paxg", "pax gold", "แพ็กซ์โกลด์", "gold", "ทอง"],
  },

  // ── Magnificent 7 (Yahoo Finance) ─────────────────────────────
  {
    symbol: "AAPL", source: "yahoo", displayName: "AAPL · Apple",
    tradeNote: "หุ้น US · ผันผวนต่ำ-ปานกลาง · เหมาะ Swing & Position Trade",
    keywords: ["aapl", "apple", "แอปเปิล"],
  },
  {
    symbol: "MSFT", source: "yahoo", displayName: "MSFT · Microsoft",
    tradeNote: "หุ้น US · ผันผวนต่ำ-ปานกลาง · เหมาะ Swing & Position Trade",
    keywords: ["msft", "microsoft", "ไมโครซอฟต์"],
  },
  {
    symbol: "NVDA", source: "yahoo", displayName: "NVDA · Nvidia",
    tradeNote: "หุ้น US · ผันผวนสูง · เหมาะ Swing Trade (AI/Chip theme)",
    keywords: ["nvda", "nvidia", "เอ็นวิเดีย"],
  },
  {
    symbol: "GOOGL", source: "yahoo", displayName: "GOOGL · Google",
    tradeNote: "หุ้น US · ผันผวนปานกลาง · เหมาะ Swing & Position Trade",
    keywords: ["googl", "google", "กูเกิล"],
  },
  {
    symbol: "AMZN", source: "yahoo", displayName: "AMZN · Amazon",
    tradeNote: "หุ้น US · ผันผวนปานกลาง · เหมาะ Swing & Position Trade",
    keywords: ["amzn", "amazon", "อเมซอน"],
  },
  {
    symbol: "META", source: "yahoo", displayName: "META · Meta",
    tradeNote: "หุ้น US · ผันผวนสูง · เหมาะ Swing Trade (ข่าวแรง)",
    keywords: ["meta", "facebook", "เฟซบุ๊ก"],
  },
  {
    symbol: "TSLA", source: "yahoo", displayName: "TSLA · Tesla",
    tradeNote: "หุ้น US · ผันผวนสูงมาก · เหมาะ Day & Swing Trade",
    keywords: ["tsla", "tesla", "เทสลา"],
  },

  // ── Index (Yahoo Finance) ──────────────────────────────────────
  {
    symbol: "^GSPC", source: "yahoo", displayName: "S&P 500",
    tradeNote: "Index US · ผันผวนต่ำ · เหมาะ Position & Long-term Invest",
    keywords: ["s&p", "sp500", "s&p500", "snp", "เอสแอนด์พี", "voo"],
  },
  {
    symbol: "^NDX", source: "yahoo", displayName: "NASDAQ 100",
    tradeNote: "Index US · ผันผวนปานกลาง · เหมาะ Swing & Position Trade (Tech)",
    keywords: ["nasdaq", "ndx", "แนสแด็ก", "nasdaq100", "qqq"],
  },
];

/**
 * หา entry จาก text ที่ผู้ใช้พิมพ์
 * คืน { symbol, source, displayName, tradeNote } หรือ null
 */
function detectSymbol(text) {
  const lower = text.toLowerCase();
  if (["setup", "วิเคราะห์"].some((kw) => lower.includes(kw))) {
    return SYMBOLS.find((s) => s.symbol === "BTCUSDT");
  }
  return SYMBOLS.find(({ keywords }) => keywords.some((kw) => lower.includes(kw))) || null;
}

module.exports = { SYMBOLS, detectSymbol };
