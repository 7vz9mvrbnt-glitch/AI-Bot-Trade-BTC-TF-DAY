# AI Bot Trade BTC — TF Day

Vercel project แยกอิสระสำหรับ BTC Daily Setup Bot
ไม่ขึ้นกับโปรเจคอื่น ชื่อไฟล์/repo ชัดเจน ป้องกันสับสน

---

## โครงสร้าง

```
api/
  webhook.js   ← LINE webhook (POST) — รับ "BTC"/"setup" แล้ว reply Flex
  btc.js       ← GET /api/btc — คืน JSON setup ให้ dashboard
  cron.js      ← GET /api/cron — รันทุกวัน 07:00 ICT (00:00 UTC)
lib/
  binance.js   ← ดึง candle จาก Binance public API (ไม่ต้อง API key)
  analyze.js   ← คำนวณ EMA8/21, Entry, SL, TP, Recommendation
  sheets.js    ← append แถวลง Google Sheet ด้วย service account JWT
  line.js      ← reply/push LINE + buildSetupFlex
public/
  dashboard.html ← หน้าเว็บดู setup วันนี้ (fetch /api/btc)
vercel.json    ← routes + cron schedule
.env.example   ← template env vars ทั้งหมด
```

---

## วิธี Deploy (ครั้งแรก)

### 1. สร้าง Google Sheet

1. อัปไฟล์ `BTC_Daily_Log.xlsx` ขึ้น Google Drive → เปิดเป็น Google Sheet
2. จด **Sheet ID** จาก URL: `https://docs.google.com/spreadsheets/d/**<ID>**/edit`
3. Share ชีตให้ service account email เป็น **Editor**

### 2. ตั้ง LINE OA Webhook

1. เข้า LINE Developers Console
2. เลือก Channel → Messaging API
3. ตั้ง Webhook URL: `https://your-project.vercel.app/api/webhook`
4. เปิด "Use webhook" ✓
5. ปิด "Auto-reply messages" เพื่อให้บอทตอบแทน

### 3. Deploy บน Vercel

```bash
npx vercel --prod
```

หรือ import repo บน vercel.com → เลือก root directory = โฟลเดอร์นี้

### 4. ตั้ง Environment Variables บน Vercel

ไปที่ Project → Settings → Environment Variables แล้วใส่ค่าทั้งหมดจาก `.env.example`

**สำคัญ:** `GOOGLE_PRIVATE_KEY` ต้องมี `\n` จริง ๆ — copy วางตรง ๆ จาก JSON service account ได้เลย Vercel จะ parse ให้

### 5. หา LINE Group/User ID สำหรับ Push

พิมพ์ข้อความใด ๆ ใน LINE Group แล้วดู log `/api/webhook` บน Vercel
จะเห็น `source.groupId` หรือ `source.userId` → copy ใส่ `LINE_PUSH_TARGETS`

### 6. อัปเดต DASHBOARD_URL

หลังได้ domain จาก Vercel แล้ว แก้ `DASHBOARD_URL` ใน Environment Variables

---

## Flow การทำงาน

```
07:00 ICT ทุกวัน
  Vercel Cron → GET /api/cron
    → fetchCandles(BTCUSDT, 50 candles)
    → analyze() → setup object
    → appendRow("Daily Log", row)   ← บันทึกชีต
    → pushMessage(groupId, Flex)    ← ส่ง LINE

คนพิมพ์ "BTC" ใน LINE Group
  LINE → POST /api/webhook
    → fetchCandles + analyze
    → replyMessage(replyToken, Flex)

เปิดเบราว์เซอร์ dashboard.html
  JS → fetch /api/btc
    → แสดงการ์ด setup + ปุ่มรีเฟรช
```

---

## Columns Google Sheet (Daily Log) A–O

| Col | ชื่อ | ตัวอย่าง |
|-----|------|--------|
| A | Datetime | 2026-06-21T00:00:00.000Z |
| B | Symbol | BTCUSDT |
| C | Trend | UP |
| D | Price | 65000 |
| E | EMA8 | 64200 |
| F | EMA21 | 62800 |
| G | EntryLow | 63500 |
| H | EntryHigh | 65500 |
| I | SL | 61800 |
| J | Stop% | 2.68 |
| K | TP | 69500 |
| L | TP% | 6.11 |
| M | Risk | 1700 |
| N | Recommendation | BUY |
| O | Note | EMA8=64200 EMA21=62800 ATR=1700 |

คอลัมน์ P–S กรอกมือ: Taken?(Y/N), Outcome(W/L/BE), R Multiple, Note

---

## Troubleshooting

| อาการ | สาเหตุ | แก้ |
|-------|--------|-----|
| LINE ไม่ตอบ | Webhook URL ผิด / ไม่ได้ enable | ตรวจ LINE Console |
| Sheet 403 | ไม่ได้ Share ให้ service account | Share → Editor |
| Cron ไม่ทำงาน | Plan Vercel ไม่รองรับ Cron | ต้องใช้ Pro plan ขึ้นไป |
| Binance ไม่ได้ | IP ถูก block หรือ symbol ผิด | ทดสอบ /api/btc ใน browser |
