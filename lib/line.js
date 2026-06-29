/**
 * LINE Messaging API helpers
 * Required env vars:
 *   LINE_CHANNEL_TOKEN   ← Channel access token (long-lived)
 */

const LINE_API = "https://api.line.me/v2/bot/message";

async function replyMessage(replyToken, messages) {
  const res = await fetch(`${LINE_API}/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LINE reply failed ${res.status}: ${err}`);
  }
  return res.json();
}

async function pushMessage(to, messages) {
  const res = await fetch(`${LINE_API}/push`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LINE push failed ${res.status}: ${err}`);
  }
  return res.json();
}

/**
 * LINE Flex card — เนื้อหาเฉพาะสิ่งจำเป็น อ่านได้ใน 5 วินาที
 * รายละเอียด EMA / Fib levels / AI comment → ดูเพิ่มใน Dashboard
 */
function buildSetupFlex(setup) {
  const closed = setup.marketClosed;
  const isAccumulate = setup.mode === "accumulate";
  const isIndicator  = setup.mode === "indicator";

  let headerColor;
  if (closed) headerColor = "#4b5563";
  else if (isIndicator) {
    headerColor = setup.trend === "UP" ? "#1e3a5f" : "#4a1942";
  } else if (isAccumulate) {
    headerColor = setup.recommendation?.startsWith("สะสมที่ Fib") ? "#92400e"
      : (setup.recommendation === "รอ PULLBACK" || setup.recommendation?.includes("ยังแพง")) ? "#78350f"
      : "#374151";
  } else {
    headerColor = setup.trend === "UP" ? "#00C851" : "#FF4444";
  }

  const recLabel = closed ? "🔒 ตลาดปิด" : setup.recommendation;

  // Trend row: Daily + Weekly
  const trendColor = setup.trend === "UP" ? "#16a34a" : "#dc2626";
  const weeklyColor = !setup.weeklyTrend ? "#9ca3af"
    : setup.weeklyTrend === "UP"
      ? (setup.trend === "UP" ? "#16a34a" : "#f97316")
      : (setup.trend === "DOWN" ? "#dc2626" : "#f97316");

  // RSI label สั้น (ใช้แค่ zone + value)
  const rsiText = setup.rsi
    ? `${setup.rsi.emoji} RSI ${setup.rsi.value} · ${setup.rsi.zone === "overbought" ? "Overbought"
        : setup.rsi.zone === "oversold" ? "Oversold"
        : setup.rsi.zone === "low" ? "Low (น่าสนใจ)"
        : setup.rsi.zone === "high" ? "High (ระวัง)"
        : "Neutral"}`
    : null;

  // MACD label สั้น
  const macdText = setup.macd
    ? `${setup.macd.emoji} MACD ${setup.macd.cross === "bullish" ? "Bullish Cross 🚀"
        : setup.macd.cross === "bearish" ? "Bearish Cross ⚠️"
        : setup.macd.histogram > 0 ? "Bullish"
        : "Bearish"}`
    : null;

  // Fib zone badge (ไม่แสดงสำหรับ indicator mode)
  const fibText = setup.fibZone && !isIndicator
    ? `${setup.fibZone.emoji} ${setup.fibZone.label}`
    : null;

  // แนวรับถัดไป — หา 2 Fib ที่ใกล้ราคาปัจจุบันที่สุด (ต่ำกว่าราคา)
  const fmt2 = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const nearSupports = setup.fibLevels && !isIndicator ? [
    { pct: "50%",   val: setup.fibLevels.f500 },
    { pct: "61.8%", val: setup.fibLevels.f618 },
    { pct: "65%",   val: setup.fibLevels.f650 },
    { pct: "78.6%", val: setup.fibLevels.f786 },
  ].filter(x => x.val < setup.price)
   .sort((a, b) => b.val - a.val)
   .slice(0, 2) : [];

  // เป้ากำไร Fib Extension (เหนือราคาปัจจุบัน)
  const extTargets = setup.fibLevels && !isIndicator ? [
    { pct: "161.8% ★", val: setup.fibLevels.fE1618 },
    { pct: "261.8%",   val: setup.fibLevels.fE2618 },
  ].filter(x => x.val && x.val > setup.price) : [];

  // Trade setup สำหรับ crypto/trade mode (ไม่ใช่ accumulate/indicator)
  const isTradeMode = !isAccumulate && !isIndicator;
  const hasTrade = isTradeMode && setup.sl != null && setup.tp != null && setup.entryLow && setup.entryHigh;

  // AI comment
  // indicator mode: แสดงบรรทัดที่เกี่ยวกับผลกระทบ (ข้าม 2 บรรทัดแรกที่เป็น trend/direction)
  // trade/accumulate mode: แสดง 2 บรรทัดแรก
  const allAiLines = (setup.aiComment || "").split("\n").filter(Boolean);
  const aiLines = isIndicator
    ? allAiLines.filter(l => l.includes("⚠️") || l.includes("✅") || l.includes("💡")).slice(0, 5)
    : allAiLines.slice(0, 2);

  return {
    type: "flex",
    altText: `${setup.displayName || setup.symbol} ${closed ? "ตลาดปิด" : setup.recommendation} | $${setup.price.toLocaleString()}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        contents: [
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: `${setup.displayName || setup.symbol}`, color: "#FFFFFF", size: "sm", weight: "bold", flex: 1 },
              ...(setup.signalScore ? [
                { type: "text", text: setup.signalScore.emoji, size: "xs", color: "#fde68a", align: "end", flex: 0 },
              ] : []),
            ],
          },
          { type: "text", text: recLabel, color: "#FFFFFF", size: "xxl", weight: "bold", margin: "xs" },
          ...(closed && setup.lastTradeDate ? [
            { type: "text", text: `ข้อมูล ณ ${setup.lastTradeDate}`, color: "#e5e7eb", size: "xxs", margin: "xs" },
          ] : []),
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          // ราคา
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "ราคา", size: "sm", color: "#555555", flex: 2 },
              { type: "text", text: `$${setup.price.toLocaleString()}`, size: "sm", color: "#111111", flex: 3, align: "end", weight: "bold" },
            ],
          },
          // Trend Daily + Weekly
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "Trend", size: "sm", color: "#555555", flex: 2 },
              {
                type: "box", layout: "horizontal", flex: 3,
                contents: [
                  { type: "text", text: `${setup.trend === "UP" ? "▲" : "▼"} Daily`, size: "sm", color: trendColor, weight: "bold", flex: 1 },
                  { type: "text", text: setup.weeklyTrend ? `W:${setup.weeklyTrend}` : "W:--", size: "xxs", color: weeklyColor, align: "end", flex: 1 },
                ],
              },
            ],
          },
          // RSI
          ...(rsiText ? [{
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "RSI 14", size: "sm", color: "#555555", flex: 2 },
              { type: "text", text: rsiText, size: "sm", flex: 3, align: "end", color: setup.rsi.color, weight: "bold", wrap: true },
            ],
          }] : []),
          // MACD
          ...(macdText ? [{
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "MACD", size: "sm", color: "#555555", flex: 2 },
              { type: "text", text: macdText, size: "sm", flex: 3, align: "end",
                color: setup.macd.cross === "bullish" ? "#16a34a" : setup.macd.cross === "bearish" ? "#dc2626" : "#555555",
                wrap: true },
            ],
          }] : []),
          // Fib Zone
          ...(fibText ? [{
            type: "separator", margin: "sm",
          }, {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "📍 Fib Zone", size: "sm", color: "#555555", flex: 2 },
              { type: "text", text: fibText, size: "sm", flex: 3, align: "end",
                color: setup.fibZone.isDCAZone ? "#16a34a" : "#9ca3af",
                weight: setup.fibZone.isDCAZone ? "bold" : "regular" },
            ],
          }] : []),
          // DCA hint สำหรับ accumulate mode
          ...(isAccumulate && setup.fibZone?.isDCAZone ? [{
            type: "text", text: "✅ เข้าโซน DCA — แบ่งซื้อได้เลย", size: "xs", color: "#16a34a", margin: "xs", wrap: true,
          }] : []),
          ...(isAccumulate && !setup.fibZone?.isDCAZone ? [{
            type: "text", text: "⏳ รอราคาลงมาโซน DCA ก่อนสะสม", size: "xs", color: "#9ca3af", margin: "xs", wrap: true,
          }] : []),

          // ── แนวรับถัดไป ──────────────────────────────────────
          ...(nearSupports.length > 0 ? [
            { type: "separator", margin: "sm" },
            {
              type: "box", layout: "vertical", margin: "sm",
              contents: [
                { type: "text", text: "📍 แนวรับถัดไป", size: "xs", color: "#6b7280", weight: "bold", margin: "none" },
                ...nearSupports.map((s, i) => {
                  const distPct = (((setup.price - s.val) / setup.price) * 100).toFixed(1);
                  const isDCA = s.pct === "61.8%" || s.pct === "65%" || s.pct === "78.6%";
                  return {
                    type: "box", layout: "horizontal", margin: "xs",
                    contents: [
                      { type: "text", text: `Fib ${s.pct}`, size: "xs", color: "#6b7280", flex: 3 },
                      { type: "text", text: `$${fmt2(s.val)}`, size: "xs", color: "#111111", flex: 3, align: "end", weight: "bold" },
                      { type: "text", text: `-${distPct}%${isDCA ? " 🎯" : ""}`, size: "xs", color: isDCA ? "#16a34a" : "#9ca3af", flex: 3, align: "end" },
                    ],
                  };
                }),
              ],
            },
          ] : []),

          // ── Fib Extension — เป้ากำไร ──────────────────────────
          ...(extTargets.length > 0 ? [
            {
              type: "box", layout: "vertical", margin: "sm",
              contents: [
                { type: "text", text: "🚀 เป้ากำไร (Fib Extension)", size: "xs", color: "#6b7280", weight: "bold", margin: "none" },
                ...extTargets.map(t => {
                  const distPct = (((t.val - setup.price) / setup.price) * 100).toFixed(1);
                  return {
                    type: "box", layout: "horizontal", margin: "xs",
                    contents: [
                      { type: "text", text: `Ext ${t.pct}`, size: "xs", color: "#6b7280", flex: 3 },
                      { type: "text", text: `$${fmt2(t.val)}`, size: "xs", color: "#16a34a", flex: 3, align: "end", weight: "bold" },
                      { type: "text", text: `+${distPct}%`, size: "xs", color: "#16a34a", flex: 3, align: "end" },
                    ],
                  };
                }),
              ],
            },
          ] : []),

          // ── Trade Setup — Entry / SL / TP (crypto trade mode) ───
          ...(hasTrade ? [
            { type: "separator", margin: "sm" },
            {
              type: "box", layout: "vertical", margin: "sm",
              contents: [
                { type: "text", text: "⚡ จุดเข้าเทรด", size: "xs", color: "#6b7280", weight: "bold" },
                {
                  type: "box", layout: "horizontal", margin: "xs",
                  contents: [
                    { type: "text", text: "Entry Zone", size: "xs", color: "#6b7280", flex: 3 },
                    { type: "text", text: `$${fmt2(setup.entryLow)} – $${fmt2(setup.entryHigh)}`, size: "xs", color: "#111111", flex: 5, align: "end", weight: "bold" },
                  ],
                },
                {
                  type: "box", layout: "horizontal", margin: "xs",
                  contents: [
                    { type: "text", text: "🔴 Stop Loss", size: "xs", color: "#6b7280", flex: 3 },
                    { type: "text", text: `$${fmt2(setup.sl)}`, size: "xs", color: "#dc2626", flex: 3, align: "end", weight: "bold" },
                    { type: "text", text: `-${setup.stopPct}%`, size: "xs", color: "#dc2626", flex: 2, align: "end" },
                  ],
                },
                {
                  type: "box", layout: "horizontal", margin: "xs",
                  contents: [
                    { type: "text", text: "🟢 Take Profit", size: "xs", color: "#6b7280", flex: 3 },
                    { type: "text", text: `$${fmt2(setup.tp)}`, size: "xs", color: "#16a34a", flex: 3, align: "end", weight: "bold" },
                    { type: "text", text: `+${setup.tpPct}%`, size: "xs", color: "#16a34a", flex: 2, align: "end" },
                  ],
                },
              ],
            },
          ] : []),

          // ── AI Comment ───────────────────────────────────────
          ...(aiLines.length > 0 ? [
            { type: "separator", margin: "sm" },
            {
              type: "box", layout: "vertical", margin: "sm",
              backgroundColor: isIndicator ? "#fffbeb" : "#f0fdf4",
              cornerRadius: "8px",
              paddingAll: "10px",
              contents: [
                { type: "text", text: isIndicator ? "🌐 ผลกระทบต่อตลาด" : "💬 AI วิเคราะห์", size: "xxs", color: isIndicator ? "#d97706" : "#16a34a", weight: "bold" },
                ...aiLines.map(line => ({
                  type: "text", text: line, size: "xs", color: "#374151", wrap: true, margin: "xs",
                })),
              ],
            },
          ] : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button", style: "link", height: "sm",
            action: {
              type: "uri",
              label: "📊 ดูรายละเอียดเพิ่มเติม",
              uri: process.env.DASHBOARD_URL || "https://your-project.vercel.app/dashboard.html",
            },
          },
        ],
      },
    },
  };
}

function row(label, value) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: "#555555", flex: 2 },
      { type: "text", text: value, size: "sm", color: "#111111", flex: 3, align: "end" },
    ],
  };
}

/**
 * สร้าง Flex card สรุปภาวะตลาดมหภาค (Oil + DXY) สำหรับ cron push รายวัน
 */
function buildMacroFlex(oilSetup, dxySetup) {
  const oilUp  = oilSetup.trend === "UP";
  const dxyUp  = dxySetup.trend === "UP";

  let outlook, outColor;
  if (!dxyUp && !oilUp) {
    outlook  = "✅ สภาพแวดล้อมดี — ดอลลาร์อ่อน + น้ำมันถูก เหมาะสะสม BTC / หุ้น / ทอง";
    outColor = "#166534";
  } else if (!dxyUp && oilUp) {
    outlook  = "⚠️ ระวังเงินเฟ้อ — น้ำมันแพงขึ้น อาจกดดันตลาด แม้ดอลลาร์อ่อน";
    outColor = "#92400e";
  } else if (dxyUp && !oilUp) {
    outlook  = "⚠️ Risk-off — ดอลลาร์แข็ง กดดัน Crypto/ทอง แม้น้ำมันถูก";
    outColor = "#78350f";
  } else {
    outlook  = "🔴 ยาก — ดอลลาร์แข็ง + น้ำมันแพง (Stagflation) ระวังตลาดผันผวน";
    outColor = "#7f1d1d";
  }

  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const arrow = (up) => up ? "▲ ขาขึ้น" : "▼ ขาลง";
  const arrowColor = (up) => up ? "#dc2626" : "#16a34a";

  return {
    type: "flex",
    altText: `🌐 Macro — น้ำมัน ${arrow(oilUp)} | DXY ${arrow(dxyUp)}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1f2937",
        contents: [
          { type: "text", text: "🌐 ภาวะตลาดมหภาค", color: "#FFFFFF", size: "md", weight: "bold" },
          { type: "text", text: "น้ำมัน WTI · ดัชนีดอลลาร์ DXY", color: "#9ca3af", size: "xs", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "🛢 น้ำมัน WTI", size: "sm", color: "#555555", flex: 3 },
              { type: "text", text: `$${fmt(oilSetup.price)}`, size: "sm", color: "#111111", flex: 2, align: "end" },
              { type: "text", text: arrow(oilUp), size: "sm", color: arrowColor(oilUp), flex: 2, align: "end" },
            ],
          },
          {
            type: "box", layout: "horizontal",
            contents: [
              { type: "text", text: "💵 DXY ดอลลาร์", size: "sm", color: "#555555", flex: 3 },
              { type: "text", text: `${fmt(dxySetup.price)}`, size: "sm", color: "#111111", flex: 2, align: "end" },
              { type: "text", text: arrow(dxyUp), size: "sm", color: arrowColor(dxyUp), flex: 2, align: "end" },
            ],
          },
          { type: "separator", margin: "sm" },
          {
            type: "box", layout: "vertical",
            backgroundColor: outColor,
            cornerRadius: "8px",
            paddingAll: "12px",
            margin: "sm",
            contents: [
              { type: "text", text: "📊 สรุปภาวะตลาด", size: "xs", color: "#d1fae5", weight: "bold" },
              { type: "text", text: outlook, size: "sm", color: "#ffffff", wrap: true, margin: "xs" },
            ],
          },
          { type: "separator", margin: "sm" },
          { type: "text", text: `น้ำมัน EMA8/21: ${oilSetup.ema8}/${oilSetup.ema21}  |  DXY EMA8/21: ${dxySetup.ema8}/${dxySetup.ema21}`, size: "xxs", color: "#9ca3af", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button", style: "link", height: "sm",
            action: { type: "uri", label: "เปิด Dashboard", uri: process.env.DASHBOARD_URL || "https://your-project.vercel.app/dashboard.html" },
          },
        ],
      },
    },
  };
}

module.exports = { replyMessage, pushMessage, buildSetupFlex, buildMacroFlex, addQuickReply };

// ── Quick Reply ──────────────────────────────────────────────────────────────
// แนบ quick reply buttons ไปกับ message สุดท้ายในชุด
function addQuickReply(messages) {
  if (!messages || messages.length === 0) return messages;
  const dashUrl = process.env.DASHBOARD_URL || "https://your-project.vercel.app/dashboard.html";
  const items = [
    { type: "action", action: { type: "uri",     label: "🌐 Dashboard",    uri: dashUrl } },
    { type: "action", action: { type: "message", label: "📊 ภาพรวม",      text: "ภาพรวม" } },
    { type: "action", action: { type: "message", label: "🟢 ซื้ออะไรดี",  text: "ซื้ออะไรดี" } },
    { type: "action", action: { type: "message", label: "🔴 ขายตัวไหน",   text: "ขายตัวไหน" } },
    { type: "action", action: { type: "message", label: "₿ BTC",           text: "BTC" } },
    { type: "action", action: { type: "message", label: "📈 VOO",           text: "VOO" } },
    { type: "action", action: { type: "message", label: "🥇 ทอง",          text: "PAXG" } },
    { type: "action", action: { type: "message", label: "📚 คู่มือ",        text: "คู่มือ" } },
    { type: "action", action: { type: "message", label: "❓ Help",          text: "help" } },
  ];
  const last = { ...messages[messages.length - 1], quickReply: { items } };
  return [...messages.slice(0, -1), last];
}
