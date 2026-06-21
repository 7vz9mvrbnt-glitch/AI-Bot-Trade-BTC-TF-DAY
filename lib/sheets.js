/**
 * Google Sheets API helper — uses service account JWT (no OAuth redirect)
 * Required env vars:
 *   SPREADSHEET_ID       ← Sheet ID จาก URL
 *   GOOGLE_CLIENT_EMAIL  ← service account email
 *   GOOGLE_PRIVATE_KEY   ← private key (-----BEGIN ... -----END...) อย่าลืม \n
 */

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

async function getAccessToken() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !rawKey) throw new Error("Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: email,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${b64(header)}.${b64(payload)}`;

  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(rawKey, "base64url");
  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token error: ${err}`);
  }
  const { access_token } = await tokenRes.json();
  return access_token;
}

/**
 * Append a single row to the named sheet tab
 * @param {string} sheetName  e.g. "Daily Log"
 * @param {Array}  row        ordered values matching columns A–O
 */
async function appendRow(sheetName, row) {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("Missing SPREADSHEET_ID");

  const token = await getAccessToken();
  const range = encodeURIComponent(`${sheetName}!A:A`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets append failed ${res.status}: ${err}`);
  }
  return res.json();
}

module.exports = { appendRow };
