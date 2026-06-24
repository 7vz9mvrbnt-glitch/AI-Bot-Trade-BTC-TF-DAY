/**
 * GET /api/richmenu?action=create|delete|status
 * One-time setup endpoint สำหรับสร้าง LINE Rich Menu
 *
 * วิธีใช้:
 *   1. เรียก GET /api/richmenu?action=create  → สร้าง + set default
 *   2. เรียก GET /api/richmenu?action=status  → ดู richMenuId ปัจจุบัน
 *   3. เรียก GET /api/richmenu?action=delete  → ลบ rich menu
 *
 * Layout: 3 คอลัมน์ × 2 แถว (6 ปุ่ม)
 * ─────────────────────────────────────────
 * | 📊 ภาพรวม | 🟢 ซื้ออะไรดี | 🔴 ขายตัวไหน |
 * | ₿ BTC     | 🥇 ทอง PAXG  | ❓ วิธีใช้    |
 * ─────────────────────────────────────────
 *
 * หมายเหตุ: LINE Rich Menu ต้องการรูปภาพ 2500×1686px
 * อัปโหลดรูปด้วย action=upload หลังจาก create แล้ว
 */

const LINE_API = "https://api.line.me/v2/bot";

async function callLine(path, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_TOKEN}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${LINE_API}${path}`, opts);
  const text = await res.text();
  return { status: res.status, ok: res.ok, data: text ? JSON.parse(text) : {} };
}

// Rich Menu JSON definition
const RICH_MENU = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "AI Trade Bot Menu",
  chatBarText: "📊 เมนูหลัก",
  areas: [
    // ── แถวบน: ภาพรวมตลาด ──────────────────────────────────
    {
      bounds: { x: 0,    y: 0, width: 833, height: 843 },
      action: { type: "message", label: "📊 ภาพรวม", text: "ภาพรวม" },
    },
    {
      bounds: { x: 833,  y: 0, width: 834, height: 843 },
      action: { type: "message", label: "🟢 ซื้ออะไรดี", text: "ซื้ออะไรดี" },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: "message", label: "🔴 ขายตัวไหน", text: "ขายตัวไหน" },
    },
    // ── แถวล่าง: สินทรัพย์หลัก + Dashboard ─────────────────
    {
      bounds: { x: 0,    y: 843, width: 625, height: 843 },
      action: { type: "message", label: "₿ BTC", text: "BTC" },
    },
    {
      bounds: { x: 625,  y: 843, width: 625, height: 843 },
      action: { type: "message", label: "📈 VOO", text: "VOO" },
    },
    {
      bounds: { x: 1250, y: 843, width: 625, height: 843 },
      action: { type: "message", label: "🥇 ทอง", text: "PAXG" },
    },
    {
      bounds: { x: 1875, y: 843, width: 625, height: 843 },
      action: {
        type: "uri",
        label: "🌐 Dashboard",
        uri: process.env.DASHBOARD_URL || "https://your-project.vercel.app/dashboard.html",
      },
    },
  ],
};

module.exports = async function handler(req, res) {
  if (!process.env.LINE_CHANNEL_TOKEN) {
    return res.status(500).json({ error: "LINE_CHANNEL_TOKEN not set" });
  }

  const action = req.query.action || "status";

  // ── status: ดู default rich menu ──────────────────────────
  if (action === "status") {
    const r = await callLine("/user/all/richmenu");
    return res.status(200).json({ action: "status", result: r.data });
  }

  // ── delete: ลบ default rich menu ──────────────────────────
  if (action === "delete") {
    const current = await callLine("/user/all/richmenu");
    const menuId = current.data?.richMenuId;
    if (!menuId) return res.status(200).json({ action: "delete", result: "no default menu" });

    await callLine(`/richmenu/${menuId}`, "DELETE");
    return res.status(200).json({ action: "delete", richMenuId: menuId, result: "deleted" });
  }

  // ── create: สร้างและ set เป็น default ─────────────────────
  if (action === "create") {
    // 1. สร้าง rich menu
    const created = await callLine("/richmenu", "POST", RICH_MENU);
    if (!created.ok) {
      return res.status(500).json({ error: "create failed", detail: created.data });
    }
    const richMenuId = created.data.richMenuId;

    // 2. set เป็น default
    const setDefault = await callLine(`/user/all/richmenu/${richMenuId}`, "POST");

    return res.status(200).json({
      action: "create",
      richMenuId,
      setDefault: setDefault.ok,
      note: "ต้องอัปโหลดรูปภาพ 2500x1686px ด้วย LINE Official Account Manager หรือ API",
      layout: "3x2: [ภาพรวม|ซื้ออะไรดี|ขายตัวไหน] / [BTC|ทอง|วิธีใช้]",
    });
  }

  return res.status(400).json({ error: "action ต้องเป็น create | delete | status" });
};
