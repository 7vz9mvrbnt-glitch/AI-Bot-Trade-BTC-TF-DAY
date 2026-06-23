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

function buildSetupFlex(setup) {
  const closed = setup.marketClosed;
  const isAccumulate = setup.mode === "accumulate";
  const isIndicator  = setup.mode === "indicator";

  let headerColor;
  if (closed) headerColor = "#4b5563";
  else if (isIndicator) {
    headerColor = setup.trend === "UP" ? "#1e3a5f" : "#4a1942";
  } else if (isAccumulate) {
    headerColor = (setup.recommendation && setup.recommendation.startsWith("สะสมที่ Fib")) ? "#92400e"
      : (setup.recommendation === "รอ PULLBACK" || (setup.recommendation && setup.recommendation.includes("ยังแพง"))) ? "#78350f"
      : "#374151";
  } else {
    headerColor = setup.trend === "UP" ? "#00C851" : "#FF4444";
  }

  const recLabel  = closed ? "🔒 ตลาดปิด" : setup.recommendation;
  const altStatus = closed ? "ตลาดปิด" : setup.recommendation;

  return {
    type: "flex",
    altText: `${setup.displayName || setup.symbol} ${altStatus} | $${setup.price.toLocaleString()}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        contents: [
          { type: "text", text: `${setup.displayName || setup.symbol} · Daily`, color: "#FFFFFF", size: "sm" },
          ...(setup.tradeNote ? [
            { type: "text", text: setup.tradeNote, color: "#d1fae5", size: "xxs", wrap: true },
          ] : []),
          { type: "text", text: recLabel, color: "#FFFFFF", size: "xxl", weight: "bold" },
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
          row("ราคา", `$${setup.price.toLocaleString()}`),
          row("Trend", setup.trend),
          row("EMA8 / EMA21", `${setup.ema8.toLocaleString()} / ${setup.ema21.toLocaleString()}`),
          ...(setup.fibZone ? [
            {
              type: "box", layout: "horizontal", margin: "sm",
              contents: [
                { type: "text", text: "📍 Fib Zone", size: "sm", color: "#555555", flex: 2 },
                {
                  type: "text",
                  text: `${setup.fibZone.emoji} ${setup.fibZone.label}`,
                  size: "sm", flex: 3, align: "end",
                  color: setup.fibZone.isDCAZone ? "#16a34a" : "#9ca3af",
                  weight: setup.fibZone.isDCAZone ? "bold" : "regular",
                },
              ],
            },
          ] : []),
          { type: "separator", margin: "sm" },
          ...(isAccumulate && setup.fibLevels ? [
            row("Swing High", `$${setup.swingHigh.toLocaleString()}`),
            row("Swing Low",  `$${setup.swingLow.toLocaleString()}`),
            { type: "separator", margin: "sm" },
            { type: "text", text: "📐 โซนสะสม Fibonacci", size: "xs", color: "#d97706", weight: "bold", margin: "sm" },
            row("Fib 50%",   `$${setup.fibLevels.f500.toLocaleString()}`),
            row("Fib 61.8%", `$${setup.fibLevels.f618.toLocaleString()}`),
            row("Fib 65%",   `$${setup.fibLevels.f650.toLocaleString()}`),
            row("Fib 78.6%", `$${setup.fibLevels.f786.toLocaleString()}`),
          ] : [
            row("Entry Zone", `$${setup.entryLow.toLocaleString()} – $${setup.entryHigh.toLocaleString()}`),
            row("Stop Loss", `$${setup.sl.toLocaleString()} (${setup.stopPct}%)`),
            row("Take Profit", `$${setup.tp.toLocaleString()} (${setup.tpPct}%)`),
            ...(!isAccumulate && setup.fibLevels ? [
              { type: "separator", margin: "sm" },
              { type: "text", text: "📐 โซน DCA Fibonacci", size: "xs", color: "#d97706", weight: "bold", margin: "sm" },
              row("Fib 50%",   `$${setup.fibLevels.f500.toLocaleString()}`),
              row("Fib 61.8%", `$${setup.fibLevels.f618.toLocaleString()}`),
              row("Fib 65%",   `$${setup.fibLevels.f650.toLocaleString()}`),
              row("Fib 78.6%", `$${setup.fibLevels.f786.toLocaleString()}`),
            ] : []),
          ]),
          { type: "separator", margin: "sm" },
          { type: "text", text: setup.note, size: "xs", color: "#888888", wrap: true },
          ...(setup.aiComment ? [
            { type: "separator", margin: "sm" },
            { type: "text", text: "💬 คำแนะนำ AI", size: "xs", color: "#555555", weight: "bold", margin: "sm" },
            { type: "text", text: setup.aiComment, size: "xs", color: "#444444", wrap: true, margin: "xs" },
          ] : []),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "uri",
              label: "เปิด Dashboard",
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

module.exports = { replyMessage, pushMessage, buildSetupFlex };
