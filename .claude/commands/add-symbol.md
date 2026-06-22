# Add Symbol — เพิ่มสินทรัพย์ใหม่เข้าบอท

เพิ่ม symbol ใหม่เข้าระบบ AI Trade Bot ให้ครบทุกจุด:
`lib/symbols.js` → `api/webhook.js` (help card) → `public/dashboard.html` (dropdown)

---

## ข้อมูลที่ต้องรู้ก่อนเพิ่ม

| ข้อมูล | ตัวอย่าง |
|---|---|
| Symbol | `AAPL`, `^GSPC`, `BTCUSDT` |
| Source | `binance` (crypto) หรือ `yahoo` (หุ้น/index) |
| Display Name | `AAPL · Apple`, `S&P 500` |
| Trade Note | คำอธิบายสั้นเหมาะกับการเทรดแบบไหน เช่น `"หุ้น US · ผันผวนสูง · เหมาะ Swing Trade"` |
| Keywords | คำที่ผู้ใช้พิมพ์ใน LINE เช่น `["aapl", "apple", "แอปเปิล"]` |
| หมวด | Crypto / Magnificent 7 / Index / อื่นๆ |

> **Crypto** ใช้ Binance (`data-api.binance.vision`) — symbol ต้องลงท้ายด้วย `USDT` — ตลาดเปิด 24/7  
> **หุ้น/Index** ใช้ Yahoo Finance — symbol ตาม Yahoo เช่น `AAPL`, `^GSPC`, `^NDX` — มีสถานะตลาดปิด/เปิด

---

## ขั้นตอน

### 1. เพิ่มใน `lib/symbols.js`

เปิดไฟล์ `lib/symbols.js` แล้วเพิ่มบรรทัดในหมวดที่เหมาะสม:

```js
// ตัวอย่าง หุ้น Yahoo
{
  symbol: "AAPL", source: "yahoo", displayName: "AAPL · Apple",
  tradeNote: "หุ้น US · ผันผวนต่ำ-ปานกลาง · เหมาะ Swing & Position Trade",
  keywords: ["aapl", "apple", "แอปเปิล"],
},

// ตัวอย่าง Crypto Binance
{
  symbol: "ADAUSDT", source: "binance", displayName: "ADA/USDT",
  tradeNote: "Futures/Spot · ผันผวนสูง · เหมาะ Swing Trade",
  keywords: ["ada", "cardano", "คาร์ดาโน"],
},

// ตัวอย่าง Index Yahoo
{
  symbol: "^DJI", source: "yahoo", displayName: "Dow Jones",
  tradeNote: "Index US · ผันผวนต่ำ · เหมาะ Position & Long-term Invest",
  keywords: ["dow", "dji", "ดาวโจนส์"],
},
```

> **tradeNote** จะแสดงใน Flex card header (สี `#d1fae5`) ใต้ชื่อ symbol — ใส่เสมอ

### 2. เพิ่มใน help card — `api/webhook.js`

หา function `buildHelpMessage()` แล้วเพิ่มบรรทัดใน section ที่ตรงกัน:

```js
// section("🌐 Index (Yahoo)", [...])  ← เพิ่มตรงนี้ถ้าเป็น index
["DOW / DJI / ดาวโจนส์", "Position · Long-term"],
```

> คอลัมน์ขวาควรสรุป trade style สั้นๆ (ไม่ใช่ชื่อบริษัท)

### 3. เพิ่มใน dashboard — `public/dashboard.html`

#### 3a. หมวด dropdown "ดู Setup สินทรัพย์อื่น"
หา `<select id="symbolSelect">` แล้วเพิ่ม `<option>` ใน `<optgroup>` ที่ตรงกัน:

```html
<option value="^DJI">DOW — Dow Jones</option>
```

#### 3b. ถ้าต้องการเพิ่มใน 3 การ์ดหลัก (บอร์ดด้านบน)
แก้ `loadAll()` และเพิ่ม `<div class="card" id="card-XXX">` ใน `.board`  
ปัจจุบัน 3 การ์ดหลัก = **BTCUSDT · PAXGUSDT · ^GSPC** เท่านั้น

### 4. ถ้า symbol ใหม่ต้องการส่ง LINE Cron ทุกเช้า

เปิด `api/cron.js` แก้ array:
```js
const PUSH_SYMBOLS = ["BTCUSDT", "PAXGUSDT", "^GSPC"]; // เพิ่ม symbol ที่นี่
```

> Cron ดึงข้อมูลและบันทึก Sheet **ครบทุก symbol** ใน `SYMBOLS` อยู่แล้ว  
> แต่ส่ง LINE push เฉพาะที่อยู่ใน `PUSH_SYMBOLS` เพื่อประหยัด quota (500 msg/เดือน free plan)

### 5. Push ขึ้น GitHub

```bash
git add lib/symbols.js api/webhook.js api/cron.js public/dashboard.html
git commit -m "feat: add <ชื่อ symbol>"
git push -u origin claude/relaxed-pascal-blo1vj
```

แล้วใช้ `mcp__github__push_files` push ไป branch `main` ด้วยเพื่อให้ Vercel deploy

---

## สถานะตลาด (Market Status)

ระบบตรวจสถานะอัตโนมัติผ่าน `getMarketStatus(source)` ใน `lib/analyze.js`:

| Source | ตรรกะ |
|---|---|
| `binance` | เปิดตลอด 24/7 — `marketClosed: false` เสมอ |
| `yahoo` | จ–ศ 13:30–20:00 UTC (= 20:30–03:00 ICT) = เปิด; นอกเวลา/วันหยุด = ปิด |

เมื่อ `marketClosed: true`:
- **LINE Flex** → header สีเทา, แสดง "🔒 ตลาดปิด" + วันที่ข้อมูลล่าสุด
- **AI Comment** → ขึ้นต้น "ตลาดปิด" แล้วต่อด้วย "คาดการณ์ Setup เมื่อตลาดเปิด"
- **Dashboard** → badge "ตลาดปิด" + แถบแจ้งเวลาตลาดเปิดรอบถัดไป (ICT)
- ไม่มี error — ดึงข้อมูลปิดล่าสุดได้ปกติ

---

## สินทรัพย์ที่รองรับอยู่แล้ว

### 🪙 Crypto (Binance) — ตลาดเปิด 24/7
| Symbol | Display | Trade Note | Keywords |
|---|---|---|---|
| BTCUSDT | BTC/USDT | Futures · ผันผวนสูง · เหมาะ Swing & Day Trade | btc, bitcoin, บิตคอยน์, บีทีซี |
| ETHUSDT | ETH/USDT | Futures · ผันผวนสูง · เหมาะ Swing Trade | eth, ethereum, อีเธอร์ |
| BNBUSDT | BNB/USDT | Futures/Spot · ผันผวนปานกลาง · เหมาะ Swing Trade | bnb, binance coin, บีเอ็นบี |
| XRPUSDT | XRP/USDT | Futures/Spot · ผันผวนสูง · เหมาะ Day & Swing Trade | xrp, ripple, ริปเปิล |
| SOLUSDT | SOL/USDT | Futures · ผันผวนสูงมาก · เหมาะ Day Trade | sol, solana, โซลานา |
| PAXGUSDT | PAXG/USDT | Spot · ผันผวนต่ำ · เหมาะ Position Trade | paxg, gold, ทอง, pax gold |

### 📈 Magnificent 7 (Yahoo) — มีสถานะตลาดปิด/เปิด
| Symbol | Display | Trade Note | Keywords |
|---|---|---|---|
| AAPL | AAPL · Apple | หุ้น US · ผันผวนต่ำ-ปานกลาง · เหมาะ Swing & Position Trade | aapl, apple, แอปเปิล |
| MSFT | MSFT · Microsoft | หุ้น US · ผันผวนต่ำ-ปานกลาง · เหมาะ Swing & Position Trade | msft, microsoft, ไมโครซอฟต์ |
| NVDA | NVDA · Nvidia | หุ้น US · ผันผวนสูง · เหมาะ Swing Trade (AI/Chip theme) | nvda, nvidia, เอ็นวิเดีย |
| GOOGL | GOOGL · Google | หุ้น US · ผันผวนปานกลาง · เหมาะ Swing & Position Trade | googl, google, กูเกิล |
| AMZN | AMZN · Amazon | หุ้น US · ผันผวนปานกลาง · เหมาะ Swing & Position Trade | amzn, amazon, อเมซอน |
| META | META · Meta | หุ้น US · ผันผวนสูง · เหมาะ Swing Trade (ข่าวแรง) | meta, facebook, เฟซบุ๊ก |
| TSLA | TSLA · Tesla | หุ้น US · ผันผวนสูงมาก · เหมาะ Day & Swing Trade | tsla, tesla, เทสลา |

### 🌐 Index (Yahoo) — มีสถานะตลาดปิด/เปิด
| Symbol | Display | Trade Note | Keywords |
|---|---|---|---|
| ^GSPC | S&P 500 | Index US · ผันผวนต่ำ · เหมาะ Position & Long-term Invest | s&p, sp500, voo, เอสแอนด์พี |
| ^NDX | NASDAQ 100 | Index US · ผันผวนปานกลาง · เหมาะ Swing & Position Trade (Tech) | nasdaq, ndx, qqq, แนสแด็ก |

---

## LINE Cron Push (07:00 ICT ทุกวัน)

ปัจจุบันส่ง LINE เฉพาะ **3 สินทรัพย์หลัก** เป็น carousel เดียว:

| Symbol | เหตุผล |
|---|---|
| BTCUSDT | Crypto หลัก — เปิด 24/7 |
| PAXGUSDT | ทองคำดิจิทัล — hedge สินทรัพย์ |
| ^GSPC | ดัชนี US หลัก — ภาพรวมตลาด |

ใช้ **1 push message/วัน** = ~30 msg/เดือน (quota free plan 500 msg/เดือน)

---

## หมายเหตุ

- **SpaceX** ยังไม่ได้ IPO — ไม่มี ticker สาธารณะ
- **Keywords ต้องเป็นตัวพิมพ์เล็กทั้งหมด** — ระบบแปลงข้อความเป็น lowercase ก่อนเปรียบเทียบ
- **tradeNote** ต้องกรอกทุกครั้ง — แสดงใน Flex header และ help card
- **Cron บันทึก Sheet ครบทุก symbol** แต่ส่ง LINE เฉพาะ `PUSH_SYMBOLS` — แยกกัน
