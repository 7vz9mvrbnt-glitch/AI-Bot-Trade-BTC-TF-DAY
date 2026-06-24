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
    symbol: "PAXGUSDT", source: "binance", displayName: "PAXG/USDT · ทองคำ",
    tradeNote: "Spot · ทองคำ Tokenized — เทรดตาม EMA + Fib",
    keywords: ["paxg", "pax gold", "แพ็กซ์โกลด์", "gold", "ทอง"],
    mode: null,
  },

  // ── Magnificent 7 (Yahoo Finance) — โหมดสะสม/ถือยาว ──────────
  {
    symbol: "AAPL", source: "yahoo", displayName: "AAPL · Apple",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["aapl", "apple", "แอปเปิล"],
    mode: "accumulate",
  },
  {
    symbol: "MSFT", source: "yahoo", displayName: "MSFT · Microsoft",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["msft", "microsoft", "ไมโครซอฟต์"],
    mode: "accumulate",
  },
  {
    symbol: "NVDA", source: "yahoo", displayName: "NVDA · Nvidia",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib (AI/Chip)",
    keywords: ["nvda", "nvidia", "เอ็นวิเดีย"],
    mode: "accumulate",
  },
  {
    symbol: "GOOGL", source: "yahoo", displayName: "GOOGL · Google",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["googl", "google", "กูเกิล"],
    mode: "accumulate",
  },
  {
    symbol: "AMZN", source: "yahoo", displayName: "AMZN · Amazon",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["amzn", "amazon", "อเมซอน"],
    mode: "accumulate",
  },
  {
    symbol: "META", source: "yahoo", displayName: "META · Meta",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["meta", "facebook", "เฟซบุ๊ก"],
    mode: "accumulate",
  },
  {
    symbol: "TSLA", source: "yahoo", displayName: "TSLA · Tesla",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib (ผันผวนสูง)",
    keywords: ["tsla", "tesla", "เทสลา"],
    mode: "accumulate",
  },
  {
    symbol: "MU", source: "yahoo", displayName: "MU · Micron Technology",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib (Semiconductor/Memory)",
    keywords: ["mu", "micron", "ไมครอน"],
    mode: "accumulate",
  },

  // ── Index (Yahoo Finance) — โหมดสะสม/ถือยาว ──────────────────
  {
    symbol: "VOO", source: "yahoo", displayName: "VOO · S&P 500 ETF",
    tradeNote: "ETF US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["s&p", "sp500", "s&p500", "snp", "เอสแอนด์พี", "voo"],
    mode: "accumulate",
  },
  {
    symbol: "QQQ", source: "yahoo", displayName: "QQQ · NASDAQ 100 ETF",
    tradeNote: "ETF US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib (Tech)",
    keywords: ["nasdaq", "ndx", "แนสแด็ก", "nasdaq100", "qqq"],
    mode: "accumulate",
  },
  // ── ตัวชี้วัดมหภาค (Yahoo Finance) — ดูทิศทางตลาดโดยรวม ─────────
  {
    symbol: "CL=F", source: "yahoo", displayName: "น้ำมัน WTI",
    tradeNote: "Futures · ดัชนีชี้วัดเงินเฟ้อ — ดูทิศทางตลาดมหภาค",
    keywords: ["oil", "น้ำมัน", "wti", "crude", "cl"],
    mode: "indicator",
  },
  {
    symbol: "DX-Y.NYB", source: "yahoo", displayName: "DXY · ดัชนีดอลลาร์",
    tradeNote: "Index · วัดความแข็งแกร่งดอลลาร์ — ส่งผลต่อทอง/Crypto/หุ้น",
    keywords: ["dxy", "dollar", "ดอลลาร์", "dx", "usd index", "ดอลล่าร์", "dollar index", "usd"],
    mode: "indicator",
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
