// backup.mjs — esporta le tabelle Supabase in CSV (eseguito dalla GitHub Action)
import fs from "node:fs";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL || !KEY) { console.error("Mancano SUPABASE_URL o SUPABASE_SERVICE_KEY"); process.exit(1); }

const tables = ["lotti", "contratti", "movimenti", "user_profiles"];
const day = new Date().toISOString().split("T")[0];
const dir = `backups/${day}`;
fs.mkdirSync(dir, { recursive: true });

const esc = (v) => v == null ? "" : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

let total = 0;
for (const t of tables) {
  const r = await fetch(`${URL}/rest/v1/${t}?select=*`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  const rows = await r.json();
  if (!Array.isArray(rows)) { console.error(t, "ERRORE:", rows); process.exit(1); }
  const cols = [...new Set(rows.flatMap((o) => Object.keys(o)))];
  const csv = [cols.join(","), ...rows.map((o) => cols.map((c) => esc(o[c])).join(","))].join("\n");
  fs.writeFileSync(`${dir}/${t}.csv`, csv);
  console.log(`${t}: ${rows.length} righe`);
  total += rows.length;
}
console.log(`Backup ${day} completato — ${total} righe totali in ${dir}`);
