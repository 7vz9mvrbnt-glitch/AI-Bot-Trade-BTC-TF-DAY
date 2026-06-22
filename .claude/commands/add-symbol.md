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
| Keywords | คำที่ผู้ใช้พิมพ์ใน LINE เช่น `["aapl", "apple", "แอปเปิล"]` |
| หมวด | Crypto / Magnificent 7 / Index / อื่นๆ |

> **Crypto** ใช้ Binance (`data-api.binance.vision`) — symbol ต้องลงท้ายด้วย `USDT`  
> **หุ้น/Index** ใช้ Yahoo Finance — symbol ตาม Yahoo เช่น `AAPL`, `^GSPC`, `^NDX`

---

## ขั้นตอน

### 1. เพิ่มใน `lib/symbols.js`

เปิดไฟล์ `lib/symbols.js` แล้วเพิ่มบรรทัดในหมวดที่เหมาะสม:

```js
// ตัวอย่าง หุ้น Yahoo
{ symbol: "AAPL", source: "yahoo", displayName: "AAPL · Apple", keywords: ["aapl", "apple", "แอปเปิล"] },

// ตัวอย่าง Crypto Binance
{ symbol: "ADAUSDT", source: "binance", displayName: "ADA/USDT", keywords: ["ada", "cardano", "คาร์ดาโน"] },

// ตัวอย่าง Index Yahoo
{ symbol: "^DJI", source: "yahoo", displayName: "Dow Jones", keywords: ["dow", "dji", "ดาวโจนส์"] },
```

### 2. เพิ่มใน help card — `api/webhook.js`

หา function `buildHelpMessage()` แล้วเพิ่มบรรทัดใน section ที่ตรงกัน:

```js
// section("🌐 Index (Yahoo)", [...])  ← เพิ่มตรงนี้ถ้าเป็น index
["DOW / DJI / ดาวโจนส์", "Dow Jones"],
```

### 3. เพิ่มใน dropdown — `public/dashboard.html`

หา `<select id="symbolSelect">` แล้วเพิ่ม `<option>` ใน `<optgroup>` ที่ตรงกัน:

```html
<option value="^DJI">DOW — Dow Jones</option>
```

### 4. Push ขึ้น GitHub

```bash
# commit local
git add lib/symbols.js api/webhook.js public/dashboard.html
git commit -m "feat: add <ชื่อ symbol>"
git push -u origin claude/relaxed-pascal-blo1vj
```

แล้วใช้ `mcp__github__push_files` push ไป branch `main` ด้วยเพื่อให้ Vercel deploy

---

## สินทรัพย์ที่รองรับอยู่แล้ว

### 🪙 Crypto (Binance)
| Symbol | Keywords |
|---|---|
| BTCUSDT | btc, bitcoin, บิตคอยน์, บีทีซี |
| ETHUSDT | eth, ethereum, อีเธอร์ |
| BNBUSDT | bnb, binance coin, บีเอ็นบี |
| XRPUSDT | xrp, ripple, ริปเปิล |
| SOLUSDT | sol, solana, โซลานา |
| PAXGUSDT | paxg, gold, ทอง, pax gold |

### 📈 Magnificent 7 (Yahoo)
| Symbol | Keywords |
|---|---|
| AAPL | aapl, apple, แอปเปิล |
| MSFT | msft, microsoft, ไมโครซอฟต์ |
| NVDA | nvda, nvidia, เอ็นวิเดีย |
| GOOGL | googl, google, กูเกิล |
| AMZN | amzn, amazon, อเมซอน |
| META | meta, facebook, เฟซบุ๊ก |
| TSLA | tsla, tesla, เทสลา |

### 🌐 Index (Yahoo)
| Symbol | Keywords |
|---|---|
| ^GSPC | s&p, sp500, voo, เอสแอนด์พี |
| ^NDX | nasdaq, ndx, qqq, แนสแด็ก |

---

## หมายเหตุ

- **SpaceX** ยังไม่ได้ IPO — ไม่มี ticker สาธารณะ
- **Keywords ต้องเป็นตัวพิมพ์เล็กทั้งหมด** — ระบบแปลงข้อความเป็น lowercase ก่อนเปรียบเทียบ
- **Cron 07:00 ICT** จะส่ง Flex ทุก symbol ใน `SYMBOLS` อัตโนมัติ — ถ้าเพิ่ม symbol ใหม่จะถูกส่งด้วยทันที
