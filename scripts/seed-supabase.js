#!/usr/bin/env node
/**
 * Seed Supabase `symbols` table from lib/symbols.js
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... node scripts/seed-supabase.js
 *
 * หมายเหตุ: ต้องใช้ service_role key เพราะ anon key มักถูก RLS บล็อก INSERT
 *   SUPABASE_ANON_KEY=<service_role_key> node scripts/seed-supabase.js
 */

const { SYMBOLS } = require("../lib/symbols");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ กำหนด SUPABASE_URL และ SUPABASE_ANON_KEY ก่อน");
  process.exit(1);
}

async function seed() {
  const rows = SYMBOLS.map((s, i) => ({
    symbol:       s.symbol,
    source:       s.source,
    display_name: s.displayName,
    trade_note:   s.tradeNote || "",
    category:     s.category || "crypto",
    mode:         s.mode || null,
    push_daily:   s.pushDaily || false,
    push_alert:   s.pushAlert || false,
    watch_news:   s.watchNews || false,
    active:       true,
    sort_order:   i,
    keywords:     s.keywords || [],
  }));

  const url = `${SUPABASE_URL}/rest/v1/symbols`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`❌ Supabase error ${res.status}:`, text);
    process.exit(1);
  }
  console.log(`✅ Seeded ${rows.length} symbols เข้า Supabase เรียบร้อย`);
  rows.forEach((r) => console.log(`   ${r.sort_order + 1}. ${r.symbol} (${r.category})`));
}

seed().catch((err) => { console.error(err); process.exit(1); });
