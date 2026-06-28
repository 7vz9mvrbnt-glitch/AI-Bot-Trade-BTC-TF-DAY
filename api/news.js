/**
 * GET /api/news
 * ดึงข่าวสำคัญจาก Yahoo Finance RSS สำหรับ key symbols
 * Returns: { ok: true, items: [{ tag, title, age }] }
 */

const { fetchNewsRSS, isImportant } = require("../lib/news");

const WATCH_SYMBOLS = [
  { symbol: "BTCUSDT",  tag: "BTC" },
  { symbol: "ETHUSDT",  tag: "ETH" },
  { symbol: "PAXGUSDT", tag: "PAXG" },
  { symbol: "NVDA",     tag: "NVDA" },
  { symbol: "AAPL",     tag: "AAPL" },
  { symbol: "META",     tag: "META" },
  { symbol: "TSLA",     tag: "TSLA" },
  { symbol: "VOO",      tag: "VOO" },
];

function formatAge(pubDate) {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  if (isNaN(d)) return "";
  const diffH = Math.round((Date.now() - d) / 3600000);
  if (diffH < 1) return "< 1h";
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const items = [];
  await Promise.allSettled(
    WATCH_SYMBOLS.map(async ({ symbol, tag }) => {
      try {
        const news = await fetchNewsRSS(symbol, 10);
        const hits = news.filter((n) => isImportant(n.title));
        const show = hits.length > 0 ? hits.slice(0, 2) : news.slice(0, 1);
        for (const n of show) {
          items.push({ tag, title: n.title, age: formatAge(n.pubDate), _ts: new Date(n.pubDate || 0).getTime() });
        }
      } catch (_) { /* skip if unavailable */ }
    })
  );

  // Sort by newest first, limit to 10
  items.sort((a, b) => b._ts - a._ts);
  const result = items.slice(0, 10).map(({ tag, title, age }) => ({ tag, title, age }));

  return res.status(200).json({ ok: true, items: result, generatedAt: new Date().toISOString() });
};
