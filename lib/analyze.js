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
 * ตรวจสถานะตลาด — คืน { marketClosed, nextOpenICT }
 * Crypto (binance): เปิดตลอด
 * หุ้น US (yahoo): จ-ศ 13:30–20:00 UTC = 20:30–03:00 ICT
 */
function getMarketStatus(source) {
  if (source !== "yahoo") return { marketClosed: false, nextOpenICT: null };

  const now = new Date();
  const day = now.getUTCDay();          // 0=Sun, 6=Sat
  const totalMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const openMin  = 13 * 60 + 30;       // 13:30 UTC = 20:30 ICT
  const closeMin = 20 * 60;            // 20:00 UTC = 03:00 ICT +1

  const isWeekday     = day >= 1 && day <= 5;
  const isDuringHours = totalMin >= openMin && totalMin < closeMin;

  if (isWeekday && isDuringHours) return { marketClosed: false, nextOpenICT: null };

  // คำนวณเวลาเปิดรอบถัดไป (ICT = UTC+7)
  const nextOpen = new Date(now);
  let daysUntilOpen = 0;
  if (!isWeekday) {
    daysUntilOpen = day === 6 ? 2 : 1;
  } else if (totalMin >= closeMin) {
    daysUntilOpen = day === 5 ? 3 : 1;
  }
  nextOpen.setUTCDate(nextOpen.getUTCDate() + daysUntilOpen);
  nextOpen.setUTCHours(13, 30, 0, 0);
  const nextOpenICT = `${nextOpen.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", weekday: "short", month: "short", day: "numeric" })} เวลา 20:30 น. (ICT)`;

  return { marketClosed: true, nextOpenICT };
}

/**
 * Main analysis — returns a setup object ready to log to Google Sheet
 * source: "binance" | "yahoo" — ใช้ตรวจสถานะตลาด
 * mode: "accumulate" — โหมดไม่เทรด ดูเทรนด์ + จังหวะสะสม (เช่น PAXG/ทอง)
 */
function analyze(candles, symbol = "BTCUSDT", source = "binance", mode = null) {
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
  if (mode === "accumulate") {
    // โหมดสะสม — ไม่ส่งสัญญาณ BUY/SHORT แต่บอกจังหวะสะสมที่ดี
    if (trend === "UP" && price <= entryHigh) recommendation = "ACCUMULATE";
    else if (trend === "UP" && price > entryHigh) recommendation = "รอ PULLBACK";
    else recommendation = "รอจังหวะ"; // trend DOWN — ยังไม่ใช่จังหวะสะสม
  } else {
    if (trend === "UP" && price <= entryHigh && price >= entryLow) recommendation = "BUY";
    else if (trend === "DOWN" && price >= entryLow && price <= entryHigh) recommendation = "SHORT";
    else if (trend === "UP" && price > entryHigh) recommendation = "WATCH_PULLBACK";
  }

  // SL/TP คำนวณแยกตาม recommendation — SHORT วาง SL เหนือ entry, LONG/WAIT วาง SL ใต้ entry
  let sl, tp, risk, stopPct, tpPct;
  if (recommendation === "SHORT") {
    sl       = parseFloat((entryHigh + atr).toFixed(2));
    risk     = parseFloat((sl - entryHigh).toFixed(2));
    tp       = parseFloat((entryLow - risk * 2).toFixed(2));
    stopPct  = parseFloat((((sl - entryHigh) / entryHigh) * 100).toFixed(2));
    tpPct    = parseFloat((((entryLow - tp) / entryLow) * 100).toFixed(2));
  } else {
    sl       = parseFloat((entryLow - atr).toFixed(2));
    risk     = parseFloat((entryLow - sl).toFixed(2));
    tp       = parseFloat((entryHigh + risk * 2).toFixed(2));
    stopPct  = parseFloat((((entryLow - sl) / entryLow) * 100).toFixed(2));
    tpPct    = parseFloat((((tp - entryHigh) / entryHigh) * 100).toFixed(2));
  }

  const note = `EMA8=${ema8Val} EMA21=${ema21Val} ATR=${parseFloat(atr.toFixed(2))}`;

  const { marketClosed, nextOpenICT } = getMarketStatus(source);

  // วันที่ปิดตลาดล่าสุด (จาก candle สุดท้าย)
  const lastTradeDate = new Date(latest.time).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok", weekday: "short", year: "numeric", month: "short", day: "numeric",
  });

  return {
    datetime:       new Date().toISOString(),
    symbol,
    mode: mode || null,
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
    marketClosed,
    nextOpenICT,
    lastTradeDate,
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
 * สร้างคำแนะนำ AI — ถ้าตลาดปิดจะขึ้นต้นด้วยหัวข้อ "คาดการณ์เมื่อตลาดเปิด"
 */
function buildAIComment(setup) {
  const { mode, trend, recommendation, price, entryLow, entryHigh, sl, tp, stopPct, tpPct, ema8, ema21,
          marketClosed, nextOpenICT, lastTradeDate } = setup;
  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lines = [];

  if (marketClosed) {
    lines.push(`🔒 ตลาดปิดอยู่ — ข้อมูลล่าสุด ณ ${lastTradeDate}`);
    if (nextOpenICT) lines.push(`⏰ ตลาดจะเปิด: ${nextOpenICT}`);
    lines.push(`📋 คาดการณ์ Setup เมื่อตลาดเปิด:`);
  }

  const trendDesc = trend === "UP"
    ? `EMA8 (${fmt(ema8)}) อยู่เหนือ EMA21 (${fmt(ema21)}) → แนวโน้มรายวันเป็นขาขึ้น`
    : `EMA8 (${fmt(ema8)}) อยู่ใต้ EMA21 (${fmt(ema21)}) → แนวโน้มรายวันเป็นขาลง`;

  lines.push(`📊 แนวโน้ม: ${trendDesc}`);

  // โหมดสะสม (ทองคำ) — ไม่แนะนำ Trade แต่บอกจังหวะซื้อสะสม
  if (mode === "accumulate") {
    if (recommendation === "ACCUMULATE") {
      lines.push(`🟡 ราคา $${fmt(price)} อยู่ในโซนสะสมที่น่าสนใจ ($${fmt(entryLow)}–$${fmt(entryHigh)})`);
      lines.push(`💰 แนวทาง: เหมาะสะสม/ซื้อเก็บระยะยาว — ราคาอยู่ในโซน EMA ยังเป็นขาขึ้น`);
      lines.push(`📌 SL อ้างอิง: $${fmt(sl)} (${stopPct}%) สำหรับผู้ที่ต้องการจัดการความเสี่ยง`);
      lines.push(`⚠️ ทองคำเหมาะ DCA สะสมทีละส่วน ไม่แนะนำ all-in ครั้งเดียว`);
    } else if (recommendation === "รอ PULLBACK") {
      lines.push(`⏳ ราคา $${fmt(price)} วิ่งขึ้นเลยโซนสะสมไปแล้ว ($${fmt(entryHigh)})`);
      lines.push(`📌 แนวทาง: รอราคาย้อนกลับมาโซน $${fmt(entryLow)}–$${fmt(entryHigh)} ก่อนสะสม`);
      lines.push(`💡 ไม่แนะนำไล่ซื้อตอนราคาสูง — รอ pullback จะได้ต้นทุนที่ดีกว่า`);
    } else {
      lines.push(`🔴 แนวโน้มยังเป็นขาลง — ยังไม่ใช่จังหวะที่ดีในการสะสม`);
      lines.push(`📌 แนวทาง: รอให้ EMA8 กลับขึ้นเหนือ EMA21 ก่อน จึงค่อยพิจารณาสะสม`);
      lines.push(`💡 ความอดทนคือกุญแจสำคัญ — ทองคำจะกลับมาเป็นขาขึ้นได้เสมอ`);
    }
    return lines.join("\n");
  }

  if (recommendation === "BUY") {
    lines.push(`✅ ราคาปิด $${fmt(price)} อยู่ในโซนเข้า Long ($${fmt(entryLow)}–$${fmt(entryHigh)})`);
    lines.push(`📌 แนวทาง: พิจารณาเปิด Long บริเวณ $${fmt(entryLow)}–$${fmt(entryHigh)}`);
    lines.push(`🛡 SL: $${fmt(sl)} (${stopPct}%) | 🎯 TP: $${fmt(tp)} (${tpPct}%) | RR ≈ 1:2`);
    lines.push(`⚠️ ${marketClosed ? "รอดู gap เปิดตลาดก่อน — ถ้าราคาเปิดเหนือ" : "รอแท่งเทียนปิดยืนเหนือ"} $${fmt(entryLow)} ค่อยเข้า`);
  } else if (recommendation === "SHORT") {
    lines.push(`🔴 ราคาปิด $${fmt(price)} อยู่ในโซนต้าน ($${fmt(entryLow)}–$${fmt(entryHigh)}) แนวโน้มขาลง`);
    lines.push(`📌 แนวทาง: พิจารณาเปิด Short บริเวณ $${fmt(entryHigh)}`);
    lines.push(`🛡 SL: $${fmt(sl)} (${stopPct}%) | 🎯 TP: $${fmt(tp)} (${tpPct}%) | RR ≈ 1:2`);
    lines.push(`⚠️ ระวัง gap ขึ้น${marketClosed ? "เมื่อเปิดตลาด" : ""} — ถ้าราคาทะลุ $${fmt(sl)} ให้ cut loss ทันที`);
  } else if (recommendation === "WATCH_PULLBACK") {
    lines.push(`⏳ แนวโน้มขาขึ้น แต่ราคา $${fmt(price)} วิ่งเลย entry zone ($${fmt(entryHigh)}) ไปแล้ว`);
    lines.push(`📌 แนวทาง: อย่าไล่ราคา — รอ pullback กลับมาโซน $${fmt(entryLow)}–$${fmt(entryHigh)}`);
    lines.push(`💡 ${marketClosed ? "ถ้าเปิดตลาดแล้วราคา gap ลงมาในโซน อาจเป็นจังหวะที่ดี" : "ถ้าราคาไม่ย้อนกลับ ให้ปล่อยผ่าน"}`);
  } else {
    lines.push(`⏸ ราคาอยู่นอกโซน entry หรือทิศทางไม่ชัดเจน`);
    lines.push(`📌 แนวทาง: รอดูก่อน ยังไม่มี setup ที่ชัดเจน${marketClosed ? "สำหรับรอบเปิดตลาดนี้" : "วันนี้"}`);
    lines.push(`💡 การไม่เทรดก็เป็นสถานะหนึ่ง — รักษาทุนไว้รอโอกาสดีกว่า`);
  }

  return lines.join("\n");
}

module.exports = { analyze, toSheetRow, ema, buildAIComment, getMarketStatus };
