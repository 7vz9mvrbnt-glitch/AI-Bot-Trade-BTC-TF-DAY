/**
 * Technical analysis helpers
 * Input: array of candle objects [{close, high, low, ...}]
 */

function ema(closes, period) {
  const k = 2 / (period + 1);
  let val = closes[0];
  for (let i = 1; i < closes.length; i++) {
    val = closes[i] * k + val * (1 - k);
  }
  return val;
}

/**
 * Main analysis — returns a setup object ready to log to Google Sheet
 * Columns A–O: Datetime, Symbol, Trend, Price, EMA8, EMA21,
 *              EntryLow, EntryHigh, SL, Stop%, TP, TP%, Risk, Recommendation, Note
 */
function analyze(candles, symbol = "BTCUSDT") {
  if (candles.length < 22) throw new Error("Need at least 22 candles for EMA21");

  const closes = candles.map((c) => c.close);
  const latest = candles[candles.length - 1];

  const ema8Val  = parseFloat(ema(closes, 8).toFixed(2));
  const ema21Val = parseFloat(ema(closes, 21).toFixed(2));
  const price    = latest.close;

  const trend = ema8Val > ema21Val ? "UP" : "DOWN";

  const recent = candles.slice(-3);
  const entryLow  = parseFloat(Math.min(...recent.map((c) => c.low)).toFixed(2));
  const entryHigh = parseFloat(Math.max(...recent.map((c) => c.high)).toFixed(2));

  const atr = candles.slice(-14).reduce((s, c) => s + (c.high - c.low), 0) / 14;

  let recommendation = "WAIT";
  if (trend === "UP" && price <= entryHigh && price >= entryLow) recommendation = "BUY";
  else if (trend === "DOWN" && price >= entryLow && price <= entryHigh) recommendation = "SHORT";
  else if (trend === "UP" && price > entryHigh) recommendation = "WATCH_PULLBACK";

  // SL/TP คำนวณแยกตาม direction — Long วาง SL ใต้ entry, Short วาง SL เหนือ entry
  let sl, tp, risk, stopPct, tpPct;
  if (trend === "DOWN") {
    // SHORT: เข้าที่แนวต้าน SL เหนือ entry, TP ต่ำกว่า entry
    sl       = parseFloat((entryHigh + atr).toFixed(2));
    risk     = parseFloat((sl - entryHigh).toFixed(2));
    tp       = parseFloat((entryLow - risk * 2).toFixed(2));
    stopPct  = parseFloat((((sl - entryHigh) / entryHigh) * 100).toFixed(2));
    tpPct    = parseFloat((((entryLow - tp) / entryLow) * 100).toFixed(2));
  } else {
    // LONG / WAIT: เข้าที่แนวรับ SL ใต้ entry, TP สูงกว่า entry
    sl       = parseFloat((entryLow - atr).toFixed(2));
    risk     = parseFloat((entryLow - sl).toFixed(2));
    tp       = parseFloat((entryHigh + risk * 2).toFixed(2));
    stopPct  = parseFloat((((entryLow - sl) / entryLow) * 100).toFixed(2));
    tpPct    = parseFloat((((tp - entryHigh) / entryHigh) * 100).toFixed(2));
  }

  const note = `EMA8=${ema8Val} EMA21=${ema21Val} ATR=${parseFloat(atr.toFixed(2))}`;

  return {
    datetime:       new Date().toISOString(),
    symbol,
    trend,
    price,
    ema8:           ema8Val,
    ema21:          ema21Val,
    entryLow,
    entryHigh,
    sl,
    stopPct,
    tp,
    tpPct,
    risk,
    recommendation,
    note,
  };
}

function toSheetRow(setup) {
  return [
    setup.datetime,
    setup.symbol,
    setup.trend,
    setup.price,
    setup.ema8,
    setup.ema21,
    setup.entryLow,
    setup.entryHigh,
    setup.sl,
    setup.stopPct,
    setup.tp,
    setup.tpPct,
    setup.risk,
    setup.recommendation,
    setup.note,
  ];
}

/**
 * สร้างคำแนะนำ AI เป็นข้อความภาษาไทย อธิบายแนวทางการเทรดจาก setup
 */
function buildAIComment(setup) {
  const { trend, recommendation, price, entryLow, entryHigh, sl, tp, stopPct, tpPct, ema8, ema21 } = setup;
  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const trendDesc = trend === "UP"
    ? `EMA8 (${fmt(ema8)}) อยู่เหนือ EMA21 (${fmt(ema21)}) → แนวโน้มรายวันเป็นขาขึ้น`
    : `EMA8 (${fmt(ema8)}) อยู่ใต้ EMA21 (${fmt(ema21)}) → แนวโน้มรายวันเป็นขาลง`;

  const lines = [`📊 แนวโน้ม: ${trendDesc}`];

  if (recommendation === "BUY") {
    lines.push(`✅ ราคา $${fmt(price)} อยู่ในโซนเข้า Long ($${fmt(entryLow)}–$${fmt(entryHigh)}) พร้อมแนวโน้มขาขึ้น`);
    lines.push(`📌 แนวทาง: พิจารณาเปิด Long บริเวณ $${fmt(entryLow)}–$${fmt(entryHigh)}`);
    lines.push(`🛡 SL: $${fmt(sl)} (${stopPct}% ใต้จุดเข้า) | 🎯 TP: $${fmt(tp)} (${tpPct}% กำไร) | RR ≈ 1:2`);
    lines.push(`⚠️ ควรรอแท่งเทียนปิดยืนเหนือ $${fmt(entryLow)} ก่อนเข้า และบริหารขนาด position ตาม % risk ที่ยอมรับได้`);
  } else if (recommendation === "SHORT") {
    lines.push(`🔴 ราคา $${fmt(price)} bounce ขึ้นมาในโซนต้าน ($${fmt(entryLow)}–$${fmt(entryHigh)}) ขณะที่แนวโน้มเป็นขาลง`);
    lines.push(`📌 แนวทาง: พิจารณาเปิด Short บริเวณ $${fmt(entryHigh)} หรือรอราคาอ่อนแอยืนยันก่อน`);
    lines.push(`🛡 SL: $${fmt(sl)} (${stopPct}% เหนือจุดเข้า) | 🎯 TP: $${fmt(tp)} (${tpPct}% กำไร) | RR ≈ 1:2`);
    lines.push(`⚠️ ระวัง fake bounce — ถ้าราคาทะลุ $${fmt(sl)} ขึ้นไปให้หยุดขาดทุนทันที ไม่ถัวเพิ่ม`);
  } else if (recommendation === "WATCH_PULLBACK") {
    lines.push(`⏳ แนวโน้มขาขึ้น แต่ราคา $${fmt(price)} วิ่งเลย entry zone ($${fmt(entryHigh)}) ไปแล้ว`);
    lines.push(`📌 แนวทาง: อย่าไล่ราคา — รอ pullback กลับมาทดสอบโซน $${fmt(entryLow)}–$${fmt(entryHigh)} ก่อนพิจารณาเข้า Long`);
    lines.push(`💡 ถ้าราคาไม่ย้อนกลับมาและวิ่งต่อ ให้ปล่อยผ่าน โอกาสถัดไปจะมา`);
  } else {
    lines.push(`⏸ ราคาอยู่นอกโซน entry หรือทิศทางไม่ชัดเจน`);
    lines.push(`📌 แนวทาง: รอดูก่อน ยังไม่มี setup ที่ชัดเจนพอสำหรับวันนี้`);
    lines.push(`💡 การไม่เทรดก็เป็นสถานะหนึ่ง — รักษาทุนไว้รอโอกาสดีกว่า`);
  }

  return lines.join("\n");
}

module.exports = { analyze, toSheetRow, ema, buildAIComment };
