/**
 * รายการเหรียญที่รองรับ — keyword ที่ใช้พิมพ์ใน LINE และ symbol ของ Binance
 */
const SYMBOLS = [
  { symbol: "BTCUSDT",  keywords: ["btc", "bitcoin", "บิตคอยน์", "บีทีซี"] },
  { symbol: "ETHUSDT",  keywords: ["eth", "ethereum", "อีเธอร์"] },
  { symbol: "BNBUSDT",  keywords: ["bnb", "binance coin", "บีเอ็นบี"] },
  { symbol: "XRPUSDT",  keywords: ["xrp", "ripple", "ริปเปิล"] },
  { symbol: "SOLUSDT",  keywords: ["sol", "solana", "โซลานา"] },
  { symbol: "PAXGUSDT", keywords: ["paxg", "pax gold", "แพ็กซ์โกลด์", "gold", "ทอง"] },
];

/**
 * หา symbol จาก text ที่ผู้ใช้พิมพ์
 * คืน symbol string หรือ null ถ้าไม่ match
 */
function detectSymbol(text) {
  const lower = text.toLowerCase();
  // BTC เป็น default ถ้าพิมพ์ "setup" หรือ "วิเคราะห์" โดยไม่ระบุเหรียญ
  if (["setup", "วิเคราะห์"].some((kw) => lower.includes(kw))) return "BTCUSDT";
  for (const { symbol, keywords } of SYMBOLS) {
    if (keywords.some((kw) => lower.includes(kw))) return symbol;
  }
  return null;
}

module.exports = { SYMBOLS, detectSymbol };
