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
  const trendColor = setup.trend === "UP" ? "#00C851" : "#FF4444";

  return {
    type: "flex",
    altText: `${setup.symbol} Setup ${setup.recommendation} | ${setup.price.toLocaleString()} USD`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: trendColor,
        contents: [
          { type: "text", text: `${setup.symbol.replace("USDT", "")}/USDT · Daily`, color: "#FFFFFF", size: "sm" },
          { type: "text", text: setup.recommendation, color: "#FFFFFF", size: "xxl", weight: "bold" },
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
          { type: "separator", margin: "sm" },
          row("Entry Zone", `$${setup.entryLow.toLocaleString()} – $${setup.entryHigh.toLocaleString()}`),
          row("Stop Loss", `$${setup.sl.toLocaleString()} (${setup.stopPct}%)`),
          row("Take Profit", `$${setup.tp.toLocaleString()} (${setup.tpPct}%)`),
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
