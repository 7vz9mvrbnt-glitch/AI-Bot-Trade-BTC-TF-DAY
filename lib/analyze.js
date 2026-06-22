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

function calcFibLevels(swingHigh, swingLow) {
  const range = swingHigh - swingLow;
  const lvl = (pct) => parseFloat((swingHigh - range * pct).toFixed(2));
  return { f236: lvl(0.236), f382: lvl(0.382), f500: lvl(0.500), f618: lvl(0.618), f650: lvl(0.650), f786: lvl(0.786) };
}

function findSwingPoints(candles, source) {
  // Crypto (binance) 24/7: 90 แท่ง = 1 quarter calendar days
  // หุ้น/Index (yahoo): 63 แท่ง = 1 quarter trading days (~252/4)
  const window = source === "yahoo" ? 63 : 90;
  const slice = candles.slice(-window);
  return {
    swingHigh: parseFloat(Math.max(...slice.map((c) => c.high)).toFixed(2)),
    swingLow:  parseFloat(Math.min(...slice.map((c) => c.low)).toFixed(2)),
  };
}

// คืน label ของ Fib ที่ราคาใกล้ที่สุด (ภายใน buffer) หรือ null
function nearestFibZone(price, fib, bufferPct = 0.03) {
  const zones = [
    { label: "78.6%", val: fib.f786 },
    { label: "65%",   val: fib.f650 },
    { label: "61.8%", val: fib.f618 },
    { label: "50%",   val: fib.f500 },
    { label: "38.2%", val: fib.f382 },
    { label: "23.6%", val: fib.f236 },
  ];
  for (const z of zones) {
    if (Math.abs(price - z.val) / z.val <= bufferPct) return z.label;
  }
  return null;
}

/**
 * คืนข้อมูล zone ที่ราคาปัจจุบันอยู่ใน Fibonacci
 * { label, emoji, color, isDCAZone, pricePct }
 *   pricePct: ตำแหน่ง 0–100% จาก swingLow ขึ้นไป swingHigh (สำหรับ progress bar)
 */
function calcFibZone(price, fib, swingHigh, swingLow) {
  const range = swingHigh - swingLow;
  const pricePct = range > 0 ? Math.max(0, Math.min(100, ((price - swingLow) / range) * 100)) : 50;

  let label, emoji, color, isDCAZone;
  if (price >= swingHigh) {
    label = "เหนือ Swing High"; emoji = "🔴"; color = "#dc2626"; isDCAZone = false;
  } else if (price >= fib.f236) {
    label = "Fib 0–23.6%";    emoji = "🔴"; color = "#ef4444"; isDCAZone = false;
  } else if (price >= fib.f382) {
    label = "Fib 23.6–38.2%"; emoji = "🟠"; color = "#f97316"; isDCAZone = false;
  } else if (price >= fib.f500) {
    label = "Fib 38.2–50%";   emoji = "🟡"; color = "#eab308"; isDCAZone = false;
  } else if (price >= fib.f618) {
    label = "Fib 50–61.8% 🎯"; emoji = "🟢"; color = "#16a34a"; isDCAZone = true;
  } else if (price >= fib.f650) {
    label = "Fib 61.8–65% 🎯"; emoji = "🟢"; color = "#15803d"; isDCAZone = true;
  } else if (price >= fib.f786) {
    label = "Fib 65–78.6% 🎯"; emoji = "🟢"; color = "#166534"; isDCAZone = true;
  } else if (price >= swingLow) {
    label = "ใต้ Fib 78.6%";  emoji = "⚫"; color = "#6b7280"; isDCAZone = false;
  } else {
    label = "ใต้ Swing Low";   emoji = "⚫"; color = "#374151"; isDCAZone = false;
  }

  return { label, emoji, color, isDCAZone, pricePct: parseFloat(pricePct.toFixed(1)) };
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
  // เลื่อนไปวันทำการถัดไป
  let daysUntilOpen = 0;
  if (!isWeekday) {
    // วันเสาร์ (6) → เปิดจันทร์ = 2 วัน, วันอาทิตย์ (0) → 1 วัน
    daysUntilOpen = day === 6 ? 2 : 1;
  } else if (totalMin >= closeMin) {
    // เลยเวลาปิดแล้ว วันนี้ → วันทำการถัดไป (ข้ามวันหยุด)
    daysUntilOpen = day === 5 ? 3 : 1; // ศุกร์ → จันทร์
  }
  nextOpen.setUTCDate(nextOpen.getUTCDate() + daysUntilOpen);
  nextOpen.setUTCHours(13, 30, 0, 0);
  // แปลงเป็น ICT (UTC+7)
  const ictHour = (13 + 7) % 24; // = 20
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

  // Fibonacci — คำนวณทุก asset (ใช้สำหรับ DCA และ accumulate mode)
  const sp = findSwingPoints(candles, source);
  const swingHigh = sp.swingHigh;
  const swingLow  = sp.swingLow;
  const fibLevels = calcFibLevels(swingHigh, swingLow);
  const nearFib   = nearestFibZone(price, fibLevels);
  const fibZone   = calcFibZone(price, fibLevels, swingHigh, swingLow);

  let recommendation = "WAIT";
  if (mode === "accumulate") {
    // ราคาอยู่ที่ Fib ≥50% (โซนสะสมลึก) และ trend ไม่ขาลงแรง → ACCUMULATE
    const atDeepFib = nearFib && ["50%","61.8%","65%","78.6%"].includes(nearFib);
    const atShallowFib = nearFib && ["23.6%","38.2%"].includes(nearFib);
    if (atDeepFib) recommendation = `สะสมที่ Fib ${nearFib}`;
    else if (atShallowFib) recommendation = `Fib ${nearFib} · ยังแพง`;
    else if (trend === "UP") recommendation = "รอ PULLBACK";
    else recommendation = "รอจังหวะ";
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
    fibLevels,
    swingHigh,
    swingLow,
    nearFib,
    fibZone,
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
          marketClosed, nextOpenICT, lastTradeDate, fibLevels, swingHigh, swingLow, nearFib } = setup;
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

  if (mode === "accumulate" && fibLevels) {
    const fibLine = `🔢 Fib (${fmt(swingLow)} → ${fmt(swingHigh)}):`;
    lines.push(fibLine);
    lines.push(`  50%=${fmt(fibLevels.f500)}  61.8%=${fmt(fibLevels.f618)}  65%=${fmt(fibLevels.f650)}  78.6%=${fmt(fibLevels.f786)}`);

    if (recommendation.startsWith("สะสมที่ Fib")) {
      lines.push(`🟡 ราคา $${fmt(price)} อยู่ที่โซน Fib ${nearFib} — เหมาะสะสม/ซื้อเก็บระยะยาว`);
      lines.push(`💰 แนวทาง: DCA สะสมทีละส่วน — ไม่แนะนำ all-in ครั้งเดียว`);
      lines.push(`📌 แนวรับถัดไป: Fib 78.6% = $${fmt(fibLevels.f786)} | Swing Low = $${fmt(swingLow)}`);
    } else if (recommendation.includes("ยังแพง")) {
      lines.push(`⏳ ราคา $${fmt(price)} อยู่ที่ Fib ${nearFib} — ยังไม่ถึงโซนสะสมที่ดี`);
      lines.push(`📌 รอ pullback ลึกกว่านี้: เป้าหมาย Fib 50%=$${fmt(fibLevels.f500)} หรือ 61.8%=$${fmt(fibLevels.f618)}`);
      lines.push(`💡 ซื้อ Fib얕 ได้ แต่ sizing เล็ก — เก็บกระสุนสำหรับ 61.8–78.6%`);
    } else if (recommendation === "รอ PULLBACK") {
      lines.push(`⏳ ราคา $${fmt(price)} ยังสูงกว่าทุก Fib buy zone`);
      lines.push(`📌 โซนสะสมที่น่าสนใจ: Fib 50%=$${fmt(fibLevels.f500)} | 61.8%=$${fmt(fibLevels.f618)} | 78.6%=$${fmt(fibLevels.f786)}`);
      lines.push(`💡 ไม่แนะนำไล่ราคา — รอ pullback มาโซน Fib ก่อน`);
    } else {
      lines.push(`🔴 แนวโน้มยังเป็นขาลง — รอให้ EMA8 กลับขึ้นเหนือ EMA21 ก่อนสะสม`);
      lines.push(`📌 ถ้าราคามาถึง Fib 65–78.6% ($${fmt(fibLevels.f650)}–$${fmt(fibLevels.f786)}) อาจสะสมบางส่วนได้`);
      lines.push(`⚠️ ยังมีความเสี่ยงลงต่อ — sizing เล็กไว้ก่อน`);
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

  // เพิ่มโซน DCA Fibonacci สำหรับทุก asset ที่ไม่ใช่ accumulate mode
  if (fibLevels) {
    lines.push(`\n📐 โซน DCA (Fib ${fmt(swingLow)}→${fmt(swingHigh)}):`);
    const dcaZones = [
      { label: "50%",   val: fibLevels.f500 },
      { label: "61.8%", val: fibLevels.f618 },
      { label: "65%",   val: fibLevels.f650 },
      { label: "78.6%", val: fibLevels.f786 },
    ];
    const zonesText = dcaZones.map((z) => {
      const tag = nearFib === z.label ? " ◀ ราคาอยู่ที่นี่" : "";
      return `  ${z.label} = $${fmt(z.val)}${tag}`;
    }).join("\n");
    lines.push(zonesText);
  }

  return lines.join("\n");
}

module.exports = { analyze, toSheetRow, ema, buildAIComment, getMarketStatus };
