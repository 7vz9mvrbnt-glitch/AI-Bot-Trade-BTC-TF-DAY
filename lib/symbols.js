/**
 * รายการ symbol ทั้งหมด — crypto (Binance) และหุ้น/Index (Yahoo Finance)
 * source: "binance" | "yahoo"
 * category: "crypto" | "stock" | "etf" | "macro"
 * tradeNote: คำอธิบายสั้นว่าเหมาะกับการเทรดแบบไหน
 */
const SYMBOLS = [
  // ── Crypto (Binance) ──────────────────────────────────────────
  {
    symbol: "BTCUSDT", source: "binance", category: "crypto", displayName: "BTC/USDT",
    tradeNote: "Futures · ผันผวนสูง · เหมาะ Swing & Day Trade",
    keywords: ["btc", "bitcoin", "บิตคอยน์", "บีทีซี"],
    pushDaily: true, pushAlert: true, watchNews: true,
  },
  {
    symbol: "ETHUSDT", source: "binance", category: "crypto", displayName: "ETH/USDT",
    tradeNote: "Futures · ผันผวนสูง · เหมาะ Swing Trade",
    keywords: ["eth", "ethereum", "อีเธอร์"],
    pushDaily: false, pushAlert: true, watchNews: true,
  },
  {
    symbol: "BNBUSDT", source: "binance", category: "crypto", displayName: "BNB/USDT",
    tradeNote: "Futures/Spot · ผันผวนปานกลาง · เหมาะ Swing Trade",
    keywords: ["bnb", "binance coin", "บีเอ็นบี"],
    pushDaily: false, pushAlert: true, watchNews: false,
  },
  {
    symbol: "XRPUSDT", source: "binance", category: "crypto", displayName: "XRP/USDT",
    tradeNote: "Futures/Spot · ผันผวนสูง · เหมาะ Day & Swing Trade",
    keywords: ["xrp", "ripple", "ริปเปิล"],
    pushDaily: false, pushAlert: true, watchNews: false,
  },
  {
    symbol: "SOLUSDT", source: "binance", category: "crypto", displayName: "SOL/USDT",
    tradeNote: "Futures · ผันผวนสูงมาก · เหมาะ Day Trade",
    keywords: ["sol", "solana", "โซลานา"],
    pushDaily: false, pushAlert: true, watchNews: false,
  },
  {
    symbol: "PAXGUSDT", source: "binance", category: "crypto", displayName: "PAXG/USDT · ทองคำ",
    tradeNote: "Spot · ทองคำ Tokenized — เทรดตาม EMA + Fib",
    keywords: ["paxg", "pax gold", "แพ็กซ์โกลด์", "gold", "ทอง"],
    mode: null, pushDaily: true, pushAlert: false, watchNews: false,
  },

  // ── Magnificent 7 (Yahoo Finance) — โหมดสะสม/ถือยาว ──────────
  {
    symbol: "AAPL", source: "yahoo", category: "stock", displayName: "AAPL · Apple",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["aapl", "apple", "แอปเปิล"],
    mode: "accumulate", pushDaily: false, pushAlert: false, watchNews: true,
  },
  {
    symbol: "MSFT", source: "yahoo", category: "stock", displayName: "MSFT · Microsoft",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["msft", "microsoft", "ไมโครซอฟต์"],
    mode: "accumulate", pushDaily: false, pushAlert: false, watchNews: false,
  },
  {
    symbol: "NVDA", source: "yahoo", category: "stock", displayName: "NVDA · Nvidia",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib (AI/Chip)",
    keywords: ["nvda", "nvidia", "เอ็นวิเดีย"],
    mode: "accumulate", pushDaily: false, pushAlert: false, watchNews: true,
  },
  {
    symbol: "GOOGL", source: "yahoo", category: "stock", displayName: "GOOGL · Google",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["googl", "google", "กูเกิล"],
    mode: "accumulate", pushDaily: false, pushAlert: false, watchNews: false,
  },
  {
    symbol: "AMZN", source: "yahoo", category: "stock", displayName: "AMZN · Amazon",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["amzn", "amazon", "อเมซอน"],
    mode: "accumulate", pushDaily: false, pushAlert: false, watchNews: false,
  },
  {
    symbol: "META", source: "yahoo", category: "stock", displayName: "META · Meta",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["meta", "facebook", "เฟซบุ๊ก"],
    mode: "accumulate", pushDaily: false, pushAlert: false, watchNews: true,
  },
  {
    symbol: "TSLA", source: "yahoo", category: "stock", displayName: "TSLA · Tesla",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib (ผันผวนสูง)",
    keywords: ["tsla", "tesla", "เทสลา"],
    mode: "accumulate", pushDaily: false, pushAlert: false, watchNews: true,
  },
  {
    symbol: "MU", source: "yahoo", category: "stock", displayName: "MU · Micron Technology",
    tradeNote: "หุ้น US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib (Semiconductor/Memory)",
    keywords: ["mu", "micron", "ไมครอน"],
    mode: "accumulate", pushDaily: false, pushAlert: false, watchNews: false,
  },

  // ── Index / ETF (Yahoo Finance) — โหมดสะสม/ถือยาว ───────────
  {
    symbol: "VOO", source: "yahoo", category: "etf", displayName: "VOO · S&P 500 ETF",
    tradeNote: "ETF US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib",
    keywords: ["s&p", "sp500", "s&p500", "snp", "เอสแอนด์พี", "voo"],
    mode: "accumulate", pushDaily: true, pushAlert: false, watchNews: true,
  },
  {
    symbol: "QQQ", source: "yahoo", category: "etf", displayName: "QQQ · NASDAQ 100 ETF",
    tradeNote: "ETF US · ไม่เทรด — ดูจังหวะสะสม/ถือยาวที่ Fib (Tech)",
    keywords: ["nasdaq", "ndx", "แนสแด็ก", "nasdaq100", "qqq"],
    mode: "accumulate", pushDaily: false, pushAlert: false, watchNews: false,
  },

  // ── ตัวชี้วัดมหภาค (Yahoo Finance) — ดูทิศทางตลาดโดยรวม ─────────
  {
    symbol: "CL=F", source: "yahoo", category: "macro", displayName: "น้ำมัน WTI",
    tradeNote: "Futures · ดัชนีชี้วัดเงินเฟ้อ — ดูทิศทางตลาดมหภาค",
    keywords: ["oil", "น้ำมัน", "wti", "crude", "cl"],
    mode: "indicator", pushDaily: true, pushAlert: false, watchNews: false,
  },
  {
    symbol: "DX-Y.NYB", source: "yahoo", category: "macro", displayName: "DXY · ดัชนีดอลลาร์",
    tradeNote: "Index · วัดความแข็งแกร่งดอลลาร์ — ส่งผลต่อทอง/Crypto/หุ้น",
    keywords: ["dxy", "dollar", "ดอลลาร์", "dx", "usd index", "ดอลล่าร์", "dollar index", "usd"],
    mode: "indicator", pushDaily: true, pushAlert: false, watchNews: false,
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

const { supabaseGet } = require("./supabase");

/** ดึง config จาก Supabase — fallback เป็น hardcoded ถ้า env ไม่ตั้งค่าหรือ error */
async function getSymbols() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return SYMBOLS;
  try {
    const rows = await supabaseGet("symbols", {
      "active": "eq.true",
      "order": "sort_order.asc",
    });
    if (!rows?.length) return SYMBOLS;
    return rows.map((r) => ({
      symbol:      r.symbol,
      source:      r.source,
      category:    r.category || "crypto",
      displayName: r.display_name,
      tradeNote:   r.trade_note || "",
      mode:        r.mode || null,
      keywords:    r.keywords || [],
      pushDaily:   r.push_daily || false,
      pushAlert:   r.push_alert || false,
      watchNews:   r.watch_news || false,
    }));
  } catch (err) {
    console.warn("[symbols] Supabase fallback:", err.message);
    return SYMBOLS;
  }
}

module.exports = { SYMBOLS, detectSymbol, getSymbols };
