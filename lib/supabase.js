/**
 * Supabase REST client (thin wrapper over fetch — no npm dependency)
 * Env vars required:
 *   SUPABASE_URL      = https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY = eyJ...
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";

async function supabaseGet(table, params = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env vars not set");

  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const url = `${SUPABASE_URL}/rest/v1/${table}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supabaseUpsert(table, rows) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase env vars not set");
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
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
  if (!res.ok) throw new Error(`Supabase upsert ${res.status}: ${await res.text()}`);
  return res.json().catch(() => ({}));
}

module.exports = { supabaseGet, supabaseUpsert };
