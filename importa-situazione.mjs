// importa-situazione.mjs
// Uso: node importa-situazione.mjs SITUAZIONE_AL_01_APRILE_2026.xlsx
// Poi: node importa-situazione.mjs SITUAZIONE_AL_01_APRILE_2026.xlsx --conferma

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const SHEET_TIPO = {
  'BIOLOGICO': 'BIOLOGICHE',
  'BIO FAIR FOR LIFE': 'FAIR FOR LIFE',
  'CONVENZIONALE': 'CONVENZIONALI',
  'BIO BIOSUISSE': 'BIOSUISSE',
};

function detectLavorazione(desc, calibro) {
  const d = String(desc || '').toUpperCase();
  const c = String(calibro || '').toUpperCase();
  if (d.includes('SCARTO')) return 'SCARTI';
  if (c === 'ROTTAME' || d.includes('ROTTAME')) return 'ROTTAME';
  return 'SGUSCIATE';
}

function detectCalibro(calibro) {
  const c = String(calibro || '').trim().toUpperCase();
  if (c === '9/11' || c === '11/13' || c === '13/15') return c;
  if (c === 'ROTTAME' || c === 'MISTO') return 'DA SCEGLIERE';
  if (c.includes('SCARTO')) {
    const m = c.match(/(\d+\/\d+)/);
    return m ? m[1] : 'DA SCEGLIERE';
  }
  return c || 'DA SCEGLIERE';
}

function detectMagazzino(row) {
  const sor = Number(row[11]) || 0;
  const fab = Number(row[12]) || 0;
  const vig = Number(row[13]) || 0;
  const cap = Number(row[14]) || 0;
  if (vig > 0) return 'Vignanello';
  if (fab > 0) return 'Fabbrica';
  if (sor > 0) return 'Soriano';
  if (cap > 0) return 'Caprarola';
  return 'Vignanello';
}

function parseSettimana(sett) {
  if (!sett) return { sett_prod: 0, anno: 2025 };
  const parts = String(sett).trim().split('/');
  return parts.length === 2
    ? { sett_prod: parseInt(parts[0]) || 0, anno: parseInt(parts[1]) || 2025 }
    : { sett_prod: parseInt(sett) || 0, anno: 2025 };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('Uso: node importa-situazione.mjs <file.xlsx>'); process.exit(1); }

  console.log('\nLettura file: ' + filePath);
  const wb = XLSX.readFile(filePath);
  const lotti = [];

  for (const sheetName of wb.SheetNames) {
    const tipo = SHEET_TIPO[sheetName];
    if (!tipo) { console.log('  Foglio "' + sheetName + '" non riconosciuto, salto.'); continue; }

    console.log('\n--- ' + sheetName + ' -> ' + tipo + ' ---');
    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    const isConv = sheetName === 'CONVENZIONALE';
    let count = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const sett = row[0];
      const lotto = row[2];
      const desc = String(row[3] || '').toUpperCase();
      const qta = Number(row[5]) || 0;
      const qtaDisp = Number(row[9]) || 0;

      if (!sett && !lotto) continue;
      if (qta <= 0 && qtaDisp <= 0) continue;
      if (qta < 1) continue;
      if (desc.includes('TOTALE') || desc.includes('CONTRATTI PER') || desc === 'SETTIMANA DI PRODUZ.' || desc === 'DATA') continue;

      const sp = parseSettimana(row[0]);
      const mv = Number(row[15]) || 0;
      const mo = Number(row[16]) || 0;
      const co = Number(row[17]) || 0;
      const cv = isConv ? 0 : (Number(row[18]) || 0);
      const rt = isConv ? (Number(row[18]) || 0) : 0;
      const ce = Number(row[19]) || 0;

      lotti.push({
        sett_prod: sp.sett_prod,
        anno: sp.anno,
        imballo: String(row[10] || row[1] || 'BIG BAG').trim(),
        lotto: String(row[2] || row[1] || '').trim(),
        desc1: tipo,
        desc2: detectLavorazione(row[3], row[4]),
        desc3: detectCalibro(row[4]),
        q_iniz: qta,
        mov: Math.max(0, qta - qtaDisp),
        magazzino: detectMagazzino(row),
        mv, mo, cv, co, ce, rt,
        contratto: '',
        acquirente: '',
      });
      count++;
    }
    console.log('  ' + count + ' lotti trovati');
  }

  console.log('\n=== RIEPILOGO ===');
  console.log('Lotti totali: ' + lotti.length);
  const byT = {}; lotti.forEach(function(l) { byT[l.desc1] = (byT[l.desc1] || 0) + 1; });
  Object.entries(byT).forEach(function(e) { console.log('  ' + e[0] + ': ' + e[1]); });
  const byL = {}; lotti.forEach(function(l) { byL[l.desc2] = (byL[l.desc2] || 0) + 1; });
  Object.entries(byL).forEach(function(e) { console.log('  ' + e[0] + ': ' + e[1]); });

  console.log('\nPrimi 5 lotti:');
  lotti.slice(0, 5).forEach(function(l, i) {
    console.log('  ' + (i+1) + '. ' + l.desc1 + ' | ' + l.desc2 + ' | ' + l.desc3 + ' | ' + l.lotto + ' | ' + l.imballo + ' | ' + l.q_iniz + 'kg | ' + l.magazzino + ' | RT=' + (l.rt*100).toFixed(1) + '%');
  });

  if (!process.argv.includes('--conferma')) {
    console.log('\nDry run. Per importare: node importa-situazione.mjs ' + filePath + ' --conferma');
    return;
  }

  console.log('\n--- IMPORTAZIONE ---');
  let inserted = 0;
  for (let i = 0; i < lotti.length; i += 50) {
    const batch = lotti.slice(i, i + 50);
    const { error } = await supabase.from('lotti').insert(batch);
    if (error) { console.error('Errore batch ' + i + ': ' + error.message); }
    else { inserted += batch.length; console.log('  ' + inserted + '/' + lotti.length); }
  }
  console.log('\n' + inserted + ' lotti importati. Contratti e acquirenti da inserire manualmente.');
}

main().catch(console.error);
