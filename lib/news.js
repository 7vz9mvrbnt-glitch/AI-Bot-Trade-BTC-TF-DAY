/**
 * Yahoo Finance RSS news fetcher
 * Fetches headline news per symbol and filters for market-moving items
 */

const IMPORTANT_KEYWORDS = [
  "ceo", "cfo", "chief executive", "resign", "appoint",
  "earnings", "eps", "revenue", "guidance", "forecast", "outlook",
  "buyback", "repurchase", "dividend",
  "acquisition", "acquire", "merger", "deal", "takeover",
  "fed", "federal reserve", "rate", "inflation", "interest rate",
  "sec", "investigation", "lawsuit", "fine", "penalty",
  "partnership", "contract", "launch",
  "bankruptcy", "default", "debt",
  "halving", "etf", "spot etf", "approval",
];

const SYMBOL_MAP = {
  BTCUSDT: "BTC-USD",
  ETHUSDT: "ETH-USD",
  BNBUSDT: "BNB-USD",
  XRPUSDT: "XRP-USD",
  SOLUSDT: "SOL-USD",
  PAXGUSDT: "PAXG-USD",
};

function toYahooSymbol(symbol) {
  return SYMBOL_MAP[symbol] || symbol;
}

async function fetchNewsRSS(symbol, maxItems = 5) {
  const yahooSym = toYahooSymbol(symbol);
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(yahooSym)}&region=US&lang=en-US`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`RSS fetch failed ${res.status}`);
  const xml = await res.text();
  return parseRSS(xml, maxItems);
}

function parseRSS(xml, maxItems) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[1];
    const title = stripTags(extract(block, "title"));
    const link  = stripTags(extract(block, "link") || extract(block, "guid"));
    const pubDate = extract(block, "pubDate");
    if (title) items.push({ title, link, pubDate });
  }
  return items;
}

function isImportant(title) {
  const lower = title.toLowerCase();
  return IMPORTANT_KEYWORDS.some((kw) => lower.includes(kw));
}

function extract(text, tag) {
  const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function stripTags(str) {
  return str.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function formatAge(pubDate) {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  if (isNaN(d)) return "";
  const diffH = Math.round((Date.now() - d) / 3600000);
  if (diffH < 1) return "< 1h";
  if (diffH < 24) return `${diffH}h`;
  return `${Math.round(diffH / 24)}d`;
}

/**
 * Fetch and return top important news for a symbol as a LINE text message
 * Returns null if no news found
 */
async function buildNewsMessage(symbol, displayName, maxItems = 5) {
  let items;
  try {
    items = await fetchNewsRSS(symbol, 20);
  } catch (e) {
    throw new Error(`ดึงข่าว ${displayName || symbol} ไม่ได้: ${e.message}`);
  }

  const important = items.filter((i) => isImportant(i.title));
  const show = important.length > 0 ? important.slice(0, maxItems) : items.slice(0, 3);

  if (show.length === 0) return null;

  const lines = [
    `📰 ข่าว ${displayName || symbol}`,
    `${"─".repeat(28)}`,
  ];
  for (const item of show) {
    const age = formatAge(item.pubDate);
    lines.push(`• ${item.title}${age ? ` (${age})` : ""}`);
  }
  if (important.length === 0) {
    lines.push(`\n💡 ไม่พบข่าวสำคัญ — แสดงข่าวล่าสุดแทน`);
  }
  return { type: "text", text: lines.join("\n") };
}

/**
 * Build a combined daily news digest for key symbols (1 message, ≤ push budget)
 * Returns null if nothing important found
 */
async function buildDailyNewsDigest(symbolEntries) {
  const DIGEST_SYMBOLS = symbolEntries.filter(
    (e) => !["CL=F", "DX-Y.NYB"].includes(e.symbol)
  );

  const importantLines = [];
  await Promise.allSettled(
    DIGEST_SYMBOLS.map(async (entry) => {
      try {
        const items = await fetchNewsRSS(entry.symbol, 10);
        const hits = items.filter((i) => isImportant(i.title));
        for (const h of hits.slice(0, 2)) {
          const age = formatAge(h.pubDate);
          importantLines.push(`• [${entry.displayName || entry.symbol}] ${h.title}${age ? ` (${age})` : ""}`);
        }
      } catch (_) { /* skip */ }
    })
  );

  if (importantLines.length === 0) return null;

  const lines = [
    `📰 ข่าวตลาดสำคัญวันนี้`,
    `${"─".repeat(28)}`,
    ...importantLines.slice(0, 8),
    ``,
    `⚠️ โปรดตรวจสอบข้อมูลเพิ่มเติมก่อนตัดสินใจลงทุน`,
  ];
  return { type: "text", text: lines.join("\n") };
}

module.exports = { fetchNewsRSS, buildNewsMessage, buildDailyNewsDigest, isImportant };
