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
 * RSI 14 — คืน { value, label, emoji, color }
 * value: 0–100
 * label: "แพงเกินไป (Overbought)" / "ปกติ" / "ถูกมาก (Oversold)"
 */
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs    = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const value = parseFloat((100 - 100 / (1 + rs)).toFixed(1));

  let label, emoji, color, zone;
  if (value >= 75) {
    label = "แพงเกินไปแล้ว"; emoji = "🔴"; color = "#dc2626"; zone = "overbought";
  } else if (value >= 60) {
    label = "เริ่มแพง — ระวัง"; emoji = "🟠"; color = "#f97316"; zone = "high";
  } else if (value >= 40) {
    label = "ปกติ";            emoji = "🟡"; color = "#eab308"; zone = "neutral";
  } else if (value >= 30) {
    label = "เริ่มถูก — น่าสนใจ"; emoji = "🟢"; color = "#16a34a"; zone = "low";
  } else {
    label = "ถูกมาก น่าสะสม"; emoji = "🟢"; color = "#166534"; zone = "oversold";
  }
  return { value, label, emoji, color, zone };
}

/**
 * MACD (12, 26, 9) — คืน { macd, signal, histogram, label, emoji, cross }
 * cross: "bullish" | "bearish" | null
 * label: ภาษาคนไม่มีตัวเลข
 */
function calcMACD(closes) {
  if (closes.length < 35) return null;
  // คำนวณ EMA ทีละจุดเพื่อหา MACD line และ signal line
  const ema12arr = emaArray(closes, 12);
  const ema26arr = emaArray(closes, 26);
  const macdArr  = ema12arr.map((v, i) => v - ema26arr[i]);
  const signalArr = emaArray(macdArr, 9);

  const macdVal   = parseFloat(macdArr[macdArr.length - 1].toFixed(6));
  const signalVal = parseFloat(signalArr[signalArr.length - 1].toFixed(6));
  const prevMacd  = macdArr[macdArr.length - 2];
  const prevSig   = signalArr[signalArr.length - 2];
  const histogram = parseFloat((macdVal - signalVal).toFixed(6));

  // ตรวจ crossover
  let cross = null;
  if (prevMacd !== undefined && prevSig !== undefined) {
    if (prevMacd <= prevSig && macdVal > signalVal) cross = "bullish";
    else if (prevMacd >= prevSig && macdVal < signalVal) cross = "bearish";
  }

  // แปลงเป็นภาษาคน
  let label, emoji;
  if (cross === "bullish") {
    label = "Momentum กลับเป็นบวก ✨"; emoji = "🟢";
  } else if (cross === "bearish") {
    label = "Momentum อ่อนแรงลง";    emoji = "🔴";
  } else if (histogram > 0) {
    label = "แรงซื้อยังมีอยู่";        emoji = "🟡";
  } else {
    label = "แรงซื้อลดลง";             emoji = "🟠";
  }

  return { macd: macdVal, signal: signalVal, histogram, label, emoji, cross };
}

// คำนวณ EMA ทีละจุด (array) สำหรับ MACD
function emaArray(values, period) {
  const k   = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

/**
 * RSI + MACD → สรุปสัญญาณรวม
 * คืน { strength, warning }
 * strength: "แข็งแกร่ง" | "ปานกลาง" | "อ่อน"
 * warning: ข้อความเตือนถ้ามี (เช่น overbought ขณะมีสัญญาณซื้อ)
 */
function calcMomentumSignal(rsi, macd, recommendation) {
  if (!rsi || !macd) return { strength: null, warning: null };

  let score = 0;
  // RSI score
  if (rsi.zone === "oversold" || rsi.zone === "low") score += 2;
  else if (rsi.zone === "neutral") score += 1;
  else score -= 1; // high/overbought

  // MACD score
  if (macd.cross === "bullish") score += 2;
  else if (macd.histogram > 0)  score += 1;
  else if (macd.cross === "bearish") score -= 2;
  else score -= 1;

  let strength;
  if (score >= 3)      strength = "แข็งแกร่ง";
  else if (score >= 1) strength = "ปานกลาง";
  else                 strength = "อ่อน";

  // คำเตือนพิเศษ
  let warning = null;
  if ((recommendation === "BUY" || recommendation?.startsWith("สะสม")) && rsi.zone === "overbought") {
    warning = "⚠️ ราคาวิ่งขึ้นเร็วเกินไปแล้ว — ควรรอให้ย่อตัวก่อนค่อยซื้อ";
  } else if (recommendation === "SHORT" && rsi.zone === "oversold") {
    warning = "⚠️ ราคาลงเร็วเกินไปแล้ว — อาจเด้งกลับ ระวัง Short ตอนนี้";
  }

  return { strength, warning };
}

/**
 * Signal Score 1–5 ดาว — ประเมินคุณภาพสัญญาณรวม
 * คืน { stars, label, emoji }
 * ใช้แสดงใน carousel header ให้ user scan ได้เร็ว
 */
function calcSignalScore(setup) {
  const { mode, trend, recommendation, rsi, macd, fibZone } = setup;
  if (mode === "indicator") return null; // macro ไม่มี score

  let score = 0;

  // Trend (2 คะแนน)
  if (trend === "UP") score += 2;

  // RSI (2 คะแนน)
  if (rsi) {
    if (rsi.zone === "oversold")  score += 2;
    else if (rsi.zone === "low")  score += 1;
    else if (rsi.zone === "overbought") score -= 1;
  }

  // MACD (2 คะแนน)
  if (macd) {
    if (macd.cross === "bullish")  score += 2;
    else if (macd.histogram > 0)   score += 1;
    else if (macd.cross === "bearish") score -= 1;
  }

  // Fib DCA Zone (2 คะแนน)
  if (fibZone?.isDCAZone) score += 2;
  else if (fibZone?.label.includes("38.2")) score += 1;

  // Recommendation bonus
  if (recommendation === "BUY" || recommendation?.startsWith("สะสมที่ Fib")) score += 1;

  // Clamp 1–5
  const stars = Math.min(5, Math.max(1, Math.round(score / 1.8)));
  const labels = ["", "อ่อนมาก", "อ่อน", "ปานกลาง", "ดี", "ดีมาก"];
  const emojis = ["", "⭐", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐"];
  return { stars, label: labels[stars], emoji: emojis[stars] };
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
 * mode: "accumulate" | "indicator" | null
 *   accumulate — ไม่เทรด ดูเทรนด์ + Fib จังหวะสะสม
 *   indicator  — ดัชนีชี้วัดมหภาค (DXY, Oil) ไม่มี signal ซื้อขาย
 */
/**
 * Weekly trend — ดู EMA8/21 บน timeframe สัปดาห์
 * ใช้ candles รายวัน: ทุก 5 แท่ง = 1 สัปดาห์ (crypto ใช้ 7)
 * คืน "UP" | "DOWN"
 */
function calcWeeklyTrend(candles, source) {
  const barsPerWeek = source === "binance" ? 7 : 5;
  if (candles.length < barsPerWeek * 22) return null;
  // downsample: เอา close ของแท่งสุดท้ายในแต่ละสัปดาห์
  const weekly = [];
  for (let i = candles.length - 1; i >= 0; i -= barsPerWeek) {
    weekly.unshift(candles[i].close);
    if (weekly.length >= 22) break;
  }
  if (weekly.length < 22) return null;
  const w8  = ema(weekly, 8);
  const w21 = ema(weekly, 21);
  return w8 > w21 ? "UP" : "DOWN";
}

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

  // RSI + MACD
  const rsi  = calcRSI(closes);
  const macd = calcMACD(closes);
  // Weekly trend (ใช้ 50 candles ที่มีอยู่ — ได้ประมาณ 7 สัปดาห์)
  const weeklyTrend = calcWeeklyTrend(candles, source);

  // Fibonacci — คำนวณทุก asset (ใช้สำหรับ DCA และ accumulate mode)
  const sp = findSwingPoints(candles, source);
  const swingHigh = sp.swingHigh;
  const swingLow  = sp.swingLow;
  const fibLevels = calcFibLevels(swingHigh, swingLow);
  const nearFib   = nearestFibZone(price, fibLevels);
  const fibZone   = calcFibZone(price, fibLevels, swingHigh, swingLow);

  let recommendation = "WAIT";
  if (mode === "indicator") {
    // ดัชนีชี้วัดมหภาค — แสดงแค่ทิศทาง ไม่มี signal ซื้อขาย
    recommendation = trend === "UP" ? "ขาขึ้น" : "ขาลง";
  } else if (mode === "accumulate") {
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

  // Momentum signal (ต้องคำนวณหลัง recommendation)
  const momentum = calcMomentumSignal(rsi, macd, recommendation);
  // Signal Score — คำนวณหลังสุด ต้องการข้อมูลทุกตัว
  const signalScore = calcSignalScore({ mode, trend, recommendation, rsi, macd, fibZone });

  const note = `EMA8=${ema8Val} EMA21=${ema21Val} ATR=${parseFloat(atr.toFixed(2))} RSI=${rsi?.value ?? "-"}`;

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
    rsi,
    macd,
    momentum,
    signalScore,
    weeklyTrend,
  };
}

/**
 * สร้างคำแนะนำ AI — ภาษาเรียบง่าย เหมาะมือใหม่
 */
function buildAIComment(setup) {
  const { mode, trend, recommendation, price, entryLow, entryHigh, sl, tp, stopPct, tpPct, ema8, ema21,
          marketClosed, nextOpenICT, lastTradeDate, fibLevels, swingHigh, swingLow, nearFib, fibZone,
          symbol, rsi, macd, momentum } = setup;
  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lines = [];

  // สถานะตลาด
  if (marketClosed) {
    lines.push(`🔒 ตลาดปิดอยู่ — ข้อมูลราคาล่าสุด ณ ${lastTradeDate}`);
    if (nextOpenICT) lines.push(`⏰ ตลาดจะเปิดอีกครั้ง: ${nextOpenICT}`);
    lines.push(`📋 วิเคราะห์ไว้ล่วงหน้าเมื่อตลาดเปิด:`);
  }

  // ทิศทางตลาด (อธิบายแบบไม่ใช้ศัพท์เทคนิค)
  if (trend === "UP") {
    lines.push(`📈 ทิศทาง: ขาขึ้น — เส้นเฉลี่ย 8 วัน ($${fmt(ema8)}) อยู่สูงกว่า 21 วัน ($${fmt(ema21)})`);
  } else {
    lines.push(`📉 ทิศทาง: ขาลง — เส้นเฉลี่ย 8 วัน ($${fmt(ema8)}) อยู่ต่ำกว่า 21 วัน ($${fmt(ema21)})`);
  }

  // RSI + MACD (แสดงทุก mode ยกเว้น indicator ที่ไม่มี signal ซื้อขาย)
  if (mode !== "indicator" && rsi) {
    lines.push(`📊 ความร้อนแรงของราคา: ${rsi.emoji} ${rsi.label}`);
  }
  if (mode !== "indicator" && macd) {
    lines.push(`⚡ แรงขับเคลื่อน: ${macd.emoji} ${macd.label}`);
  }
  if (momentum?.strength) {
    lines.push(`🔋 สัญญาณรวม: ${momentum.strength === "แข็งแกร่ง" ? "💪" : momentum.strength === "ปานกลาง" ? "⚖️" : "😴"} ${momentum.strength}`);
  }
  if (momentum?.warning) {
    lines.push(momentum.warning);
  }
  // Weekly trend cross-check
  if (mode !== "indicator" && setup.weeklyTrend) {
    const dailyUp  = trend === "UP";
    const weeklyUp = setup.weeklyTrend === "UP";
    if (dailyUp && !weeklyUp) {
      lines.push(`⚠️ Trend รายวันขึ้น แต่ Trend รายสัปดาห์ยังลง — สัญญาณอาจไม่แข็งแกร่ง รอยืนยันก่อน`);
    } else if (!dailyUp && weeklyUp) {
      lines.push(`💡 Trend รายสัปดาห์ยังขึ้น — ถ้า Daily กลับขึ้นได้จะเป็นสัญญาณดี`);
    }
  }

  // ── โหมดตัวชี้วัดมหภาค (DXY / Oil) ─────────────────────────────
  if (mode === "indicator") {
    const isDXY = symbol === "DX-Y.NYB";
    const isOil = symbol === "CL=F";

    lines.push(`\n📐 ช่วงราคาย้อนหลัง 1 ไตรมาส: $${fmt(swingLow)} – $${fmt(swingHigh)}`);
    lines.push(`📍 ตำแหน่งปัจจุบัน: ${fibZone.emoji} ${fibZone.label} (${fibZone.pricePct}% จากจุดต่ำสุด)`);

    if (isDXY) {
      lines.push(`\n🌐 ความหมายต่อตลาด:`);
      if (trend === "UP") {
        lines.push(`  ⚠️ ดอลลาร์แข็งค่า — กดดันทองคำและ Crypto ลง`);
        lines.push(`  ⚠️ หุ้น Emerging Markets มักถูกกดดัน`);
        lines.push(`  ✅ หุ้นส่งออกสหรัฐฯ บางตัวได้รับผลบวก`);
        lines.push(`  💡 ช่วงนี้เหมาะถือเงินสด/พันธบัตรมากกว่า Crypto`);
      } else {
        lines.push(`  ✅ ดอลลาร์อ่อนค่า — เป็นบวกต่อทองคำและ Crypto`);
        lines.push(`  ✅ หุ้น Emerging Markets และสินค้าโภคภัณฑ์มักปรับขึ้น`);
        lines.push(`  💡 สภาพแวดล้อมเอื้อต่อการสะสม BTC / ทอง`);
      }
    } else if (isOil) {
      lines.push(`\n🛢️ ความหมายต่อตลาด:`);
      if (trend === "UP") {
        lines.push(`  ⚠️ น้ำมันแพงขึ้น — เพิ่มแรงกดดันเงินเฟ้อ`);
        lines.push(`  ⚠️ ถ้าเงินเฟ้อสูง Fed อาจขึ้นดอกเบี้ย → หุ้นและ Crypto มักกดดัน`);
        lines.push(`  ✅ หุ้นกลุ่มพลังงาน (XOM, CVX) มักได้ประโยชน์`);
        lines.push(`  💡 ระวังตลาดหุ้นผันผวนถ้าน้ำมันขึ้นเร็วเกินไป`);
      } else {
        lines.push(`  ✅ น้ำมันราคาลง — ลดแรงกดดันเงินเฟ้อ`);
        lines.push(`  ✅ Fed มีโอกาสลดดอกเบี้ยมากขึ้น → ดีต่อหุ้นและ Crypto`);
        lines.push(`  ⚠️ อาจสะท้อนความกังวลเศรษฐกิจชะลอตัว ดูข้อมูลประกอบ`);
        lines.push(`  💡 สภาพแวดล้อมเอื้อต่อหุ้นเทคโนโลยีและ Crypto`);
      }
    }
    return lines.join("\n");
  }

  // ── โหมดสะสม (หุ้น/ทอง/Index) ──────────────────────────────────
  if (mode === "accumulate" && fibLevels) {
    lines.push(`\n📐 จุดซื้อสะสมที่ดี (คำนวณจากราคาสูงสุด–ต่ำสุดย้อนหลัง 1 ไตรมาส):`);
    lines.push(`  ราคาสูงสุด: $${fmt(swingHigh)}  |  ราคาต่ำสุด: $${fmt(swingLow)}`);
    lines.push(`  🟢 ดีมาก  Fib 61.8% = $${fmt(fibLevels.f618)}`);
    lines.push(`  🟢 ดีมาก  Fib 65%   = $${fmt(fibLevels.f650)}`);
    lines.push(`  🟢 ดีที่สุด Fib 78.6% = $${fmt(fibLevels.f786)}`);
    lines.push(`  🟡 พอได้   Fib 50%   = $${fmt(fibLevels.f500)}`);

    if (recommendation.startsWith("สะสมที่ Fib")) {
      lines.push(`\n✅ ราคาตอนนี้ $${fmt(price)} อยู่ในโซนน่าซื้อแล้ว (Fib ${nearFib})`);
      lines.push(`💡 แนะนำ: ซื้อสะสมได้เลย แต่ให้แบ่งซื้อ 2–3 ครั้ง อย่าใส่เงินทั้งหมดครั้งเดียว`);
      lines.push(`⚠️ ถ้าราคาลงต่อ แนวรับถัดไปที่ $${fmt(fibLevels.f786)} ก็ซื้อเพิ่มได้อีก`);
    } else if (recommendation.includes("ยังแพง")) {
      lines.push(`\n⏳ ราคาตอนนี้ $${fmt(price)} — ยังแพงอยู่ ยังไม่ถึงโซนที่ดีที่สุด`);
      lines.push(`💡 ถ้าอยากเริ่มซื้อ ซื้อได้นิดหน่อย แต่เก็บเงินส่วนใหญ่ไว้`);
      lines.push(`📌 รอให้ราคาลงมาที่ $${fmt(fibLevels.f618)} หรือ $${fmt(fibLevels.f786)} ก่อน จะคุ้มกว่ามาก`);
    } else if (recommendation === "รอ PULLBACK") {
      lines.push(`\n⏳ ราคาตอนนี้ $${fmt(price)} — ยังแพงเกินไป ยังไม่ใช่จังหวะซื้อ`);
      lines.push(`💡 รอให้ราคาลงมาก่อน อย่าซื้อตามตอนราคาสูง`);
      lines.push(`📌 จุดที่ควรรอซื้อ: $${fmt(fibLevels.f500)} หรือ $${fmt(fibLevels.f618)} หรือ $${fmt(fibLevels.f786)}`);
    } else {
      lines.push(`\n🔴 ทิศทางยังเป็นขาลง — ยังไม่ถึงเวลาซื้อ`);
      lines.push(`💡 รอให้ราคาหยุดลงและเริ่มกลับขึ้นก่อน (เส้นเฉลี่ย 8 วัน กลับขึ้นเหนือ 21 วัน)`);
      lines.push(`📌 ถ้าราคาลงมาถึง $${fmt(fibLevels.f650)}–$${fmt(fibLevels.f786)} อาจซื้อสะสมได้เล็กน้อย`);
    }
    return lines.join("\n");
  }

  // ── โหมดเทรด (Crypto) ────────────────────────────────────────────
  if (recommendation === "BUY") {
    lines.push(`\n✅ สัญญาณซื้อ — ราคา $${fmt(price)} อยู่ในโซนน่าเข้า`);
    lines.push(`📌 เข้าซื้อได้บริเวณ $${fmt(entryLow)}–$${fmt(entryHigh)}`);
    lines.push(`🛡 ตั้ง Stop Loss (ขาดทุนสูงสุด): $${fmt(sl)} (${stopPct}% จากราคาเข้า)`);
    lines.push(`🎯 เป้ากำไร: $${fmt(tp)} (${tpPct}% จากราคาเข้า) — กำไร:ขาดทุน ≈ 2:1`);
    lines.push(`⚠️ ${marketClosed ? "ตลาดปิดอยู่ — รอดูราคาเปิดก่อน ถ้าราคาเปิดเหนือ" : "รอให้แท่งเทียนปิดเหนือ"} $${fmt(entryLow)} ค่อยเข้า`);
  } else if (recommendation === "SHORT") {
    lines.push(`\n🔴 สัญญาณขาย/Short — ราคา $${fmt(price)} อยู่ในโซนต้านแถว $${fmt(entryHigh)}`);
    lines.push(`📌 เปิด Short ได้บริเวณ $${fmt(entryHigh)}`);
    lines.push(`🛡 ตั้ง Stop Loss (ขาดทุนสูงสุด): $${fmt(sl)} (${stopPct}% จากราคาเข้า)`);
    lines.push(`🎯 เป้ากำไร: $${fmt(tp)} (${tpPct}%) — กำไร:ขาดทุน ≈ 2:1`);
    lines.push(`⚠️ ถ้าราคาขึ้นทะลุ $${fmt(sl)} ให้ปิด order ขาดทุนทันที อย่ารอ`);
  } else if (recommendation === "WATCH_PULLBACK") {
    lines.push(`\n⏳ ทิศทางขึ้น แต่ราคา $${fmt(price)} วิ่งขึ้นไปสูงเกินโซนเข้าแล้ว`);
    lines.push(`💡 อย่าไล่ซื้อตอนนี้ — รอให้ราคาย้อนลงมาโซน $${fmt(entryLow)}–$${fmt(entryHigh)} ก่อน`);
    lines.push(`📌 ${marketClosed ? "ถ้าเปิดตลาดแล้วราคาลงมาในโซน อาจเป็นจังหวะดี" : "ถ้าราคาไม่ย้อนลงมา ให้รอโอกาสหน้า"}`);
  } else {
    lines.push(`\n⏸ ยังไม่มีสัญญาณชัดเจนในตอนนี้`);
    lines.push(`💡 รอดูก่อน — ไม่มีจังหวะที่ดีก็ไม่ต้องเทรด`);
    lines.push(`📌 การรักษาเงินทุนไว้รอจังหวะดีๆ ดีกว่าเทรดโดยไม่มีสัญญาณ`);
  }

  // จุดซื้อสะสม Fib สำหรับ crypto
  if (fibLevels) {
    lines.push(`\n📐 จุดซื้อสะสม BTC (ย้อนหลัง 90 วัน):`);
    const dcaZones = [
      { label: "50%",   val: fibLevels.f500 },
      { label: "61.8%", val: fibLevels.f618 },
      { label: "65%",   val: fibLevels.f650 },
      { label: "78.6%", val: fibLevels.f786 },
    ];
    dcaZones.forEach((z) => {
      const here = nearFib === z.label ? "  ◀ ราคาอยู่แถวนี้" : "";
      lines.push(`  ${z.label} = $${fmt(z.val)}${here}`);
    });
  }

  return lines.join("\n");
}

module.exports = { analyze, ema, buildAIComment, getMarketStatus, calcRSI, calcMACD, calcSignalScore, calcWeeklyTrend };
