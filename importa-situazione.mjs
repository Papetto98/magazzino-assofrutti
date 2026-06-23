// importa-situazione.mjs
// Uso (dry run):  node importa-situazione.mjs 2025.xlsx
// Importa:        node importa-situazione.mjs 2025.xlsx --conferma
//
// ANNATA DI RACCOLTA (anno_raccolta): ricavata dal NOME FILE (rinomina 2025.xlsx / 2024.xlsx).
//   Nome ambiguo (piu anni) -> passala a mano: --annata=2024
//
// LETTURA COLONNE: lo script mappa le colonne tramite le INTESTAZIONI del foglio,
//   non per posizione fissa. Cosi funziona anche con fogli dal layout diverso
//   (es. il CONVENZIONALE 2024 ha colonne spostate e ordine qualita diverso).

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// --- CONFIG -----------------------------------------------------------------
// Foglio "Merce ASSOBIO": e merce di terzi (conto lavoro). Viene importata ma
// marcata conto_lavoro=true, cosi resta separata dai totali di proprieta.
// Metti null per saltarla del tutto.
const ASSOBIO_TIPO = 'BIOLOGICHE';
// Righe con "GIFFONI" nella descrizione: false = restano col tipo del foglio (CONVENZIONALI);
// true = diventano tipo 'GIFFONI'.
const GIFFONI_DA_DESC = true;
// Magazzino per la colonna "ALTRI MAGAZZINI" quando e l'unica valorizzata.
const ALTRI_MAGAZZINI = 'ABC Service';
// ---------------------------------------------------------------------------

const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Alias intestazioni -> campo logico (confronto su intestazione normalizzata, match esatto)
const COLDEF = {
  sett:     ['SETTIMANADIPRODUZ', 'SETTIMANADIPRODUZIONE', 'PRODUZ'],
  lottoImb: ['LOTTOIMBALLO'],
  lottoNoc: ['LOTTONOCCIOLE'],
  lotto:    ['LOTTO'],
  desc:     ['DESCRIZIONEPRODOTTO', 'DESCRIZIONE'],
  calibro:  ['CALIBRO'],
  qgiac:    ['QUANTITAINGIACENZA', 'QTA'],
  qdisp:    ['QUANTITADISPONIBILI', 'QUANTITADISPONIBILE', 'GIACENZAFABRICA', 'GIACENZAFABBRICA'],
  tipoImb:  ['TIPOIMBALLO', 'NUMERO'],
  cliente:  ['CLIENTEFOR', 'CLIENTE'],
  magSor:   ['SORIANO'],
  magFab:   ['FABRICA', 'FABBRICA'],
  magVig:   ['VIGNANELLO'],
  magCap:   ['CAPRAROLA'],
  magAlt:   ['ALTRIMAGAZZINI'],
  mv:       ['MARCIOVIS', 'MV', 'GV'],
  mo:       ['MARCIOOCC', 'MO', 'GO'],
  cv:       ['CIMICIATOVIS', 'CIMICVIS', 'CV'],
  co:       ['CIMICIATOOCC', 'CO'],
  ce:       ['CORPIESTRANEI', 'CE'],
  rt:       ['ROTTAME', 'ROTT', 'RT'],
};

function sheetTipo(sheetName) {
  const n = norm(sheetName);
  if (n.includes('BIOSUISSE')) return 'BIOSUISSE';
  if (n.includes('FAIRFORLIFE')) return 'FAIR FOR LIFE';
  if (n.includes('ASSOBIO')) return ASSOBIO_TIPO; // puo essere null (=salta)
  if (n.includes('BIOLOGICO')) return 'BIOLOGICHE';
  if (n.includes('CONVENZIONALE')) return 'CONVENZIONALI';
  return undefined; // foglio non riconosciuto
}

// Trova la riga di intestazione e costruisce la mappa campo->indice colonna.
function buildColMap(rows) {
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const row = rows[r] || [];
    const normed = row.map(norm);
    if (!normed.some(h => COLDEF.sett.includes(h))) continue;
    if (!normed.some(h => COLDEF.desc.includes(h))) continue;
    const map = {};
    for (const [field, aliases] of Object.entries(COLDEF)) {
      const idx = normed.findIndex(h => h && aliases.includes(h));
      if (idx >= 0 && map[field] === undefined) map[field] = idx;
    }
    return { headerRow: r, map };
  }
  return null;
}

const val = (row, idx) => (idx === undefined ? '' : row[idx]);
const numv = (row, idx) => Number(val(row, idx)) || 0;

function detectLavorazione(desc, calibro) {
  const d = norm(desc), c = norm(calibro);
  if (d.includes('SCARTO') || d.includes('SCARTI') || c.includes('SCARTO') || c.includes('SCARTI')) return 'SCARTI';
  if (d.includes('ROTTAME') || c.includes('ROTTAME')) return 'ROTTAME';
  return 'SGUSCIATE';
}

function detectCalibro(calibroCell, desc) {
  let c = String(calibroCell || '').trim().toUpperCase();
  if (!c) { // niente colonna calibro: ricava dalla descrizione
    const m = String(desc || '').toUpperCase().match(/\b(9\/11|11\/13|13\/15)\b/);
    if (m) c = m[1];
    else {
      const du = norm(desc);
      if (du.includes('GRANELLA')) return 'GRANELLA';
      if (du.includes('FARINA')) return 'FARINA';
      if (du.includes('PASTA')) return 'PASTA';
      return 'DA SCEGLIERE';
    }
  }
  if (c === '9/11' || c === '11/13' || c === '13/15') return c;
  if (c === 'ROTTAME' || c === 'MISTO') return 'DA SCEGLIERE';
  if (c.includes('SCARTO')) { const m = c.match(/(\d+\/\d+)/); return m ? m[1] : 'DA SCEGLIERE'; }
  return c || 'DA SCEGLIERE';
}

function detectMagazzino(row, map) {
  const sor = numv(row, map.magSor), fab = numv(row, map.magFab),
        vig = numv(row, map.magVig), cap = numv(row, map.magCap), alt = numv(row, map.magAlt);
  if (vig > 0) return 'Vignanello';
  if (fab > 0) return 'Fabbrica';
  if (sor > 0) return 'Soriano';
  if (cap > 0) return 'Caprarola';
  if (alt > 0) return ALTRI_MAGAZZINI;
  return 'Fabbrica';
}

function parseSettimana(sett, annoDefault) {
  const fb = annoDefault || 2025;
  if (!sett) return { sett_prod: 0, anno: fb };
  const parts = String(sett).trim().split('/');
  return parts.length === 2
    ? { sett_prod: parseInt(parts[0]) || 0, anno: parseInt(parts[1]) || fb }
    : { sett_prod: parseInt(sett) || 0, anno: fb };
}

function detectAnnata(filePath, argv) {
  const ovv = argv.find(a => a.startsWith('--annata='));
  if (ovv) {
    const y = parseInt(ovv.split('=')[1], 10);
    if (!y || y < 2000 || y > 2100) { console.error('--annata non valido: usa --annata=2025'); process.exit(1); }
    return y;
  }
  const base = filePath.split(/[\\/]/).pop();
  const found = [...new Set((base.match(/20\d\d/g) || []).map(Number))];
  if (found.length === 1) return found[0];
  if (found.length === 0) {
    console.error('\nIMPOSSIBILE determinare l\'annata dal nome "' + base + '". Rinomina (es. 2025.xlsx) o usa --annata=2025');
    process.exit(1);
  }
  console.error('\nNome "' + base + '" contiene piu anni (' + found.join(', ') + '): ambiguo. Usa --annata=' + found[0]);
  process.exit(1);
}

const itk = n => Number(n || 0).toLocaleString('it-IT');

async function main() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('Uso: node importa-situazione.mjs <file.xlsx>'); process.exit(1); }

  console.log('\nLettura file: ' + filePath);
  const annoRaccolta = detectAnnata(filePath, process.argv);
  console.log('ANNATA DI RACCOLTA (anno_raccolta): ' + annoRaccolta + '  <-- verifica che sia corretta!');
  const wb = XLSX.readFile(filePath);

  const lotti = [];
  let giffoniN = 0;

  for (const sheetName of wb.SheetNames) {
    const tipo = sheetTipo(sheetName);
    if (tipo === undefined) { console.log('  Foglio "' + sheetName + '" non riconosciuto, salto.'); continue; }
    if (tipo === null) { console.log('  Foglio "' + sheetName + '" (ASSOBIO) saltato per configurazione (ASSOBIO_TIPO=null).'); continue; }

    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    const cm = buildColMap(data);
    if (!cm) { console.log('  Foglio "' + sheetName + '": intestazione non trovata, salto.'); continue; }
    const { headerRow, map } = cm;
    const isAssobio = norm(sheetName).includes('ASSOBIO');

    let count = 0, sGiac = 0, sDisp = 0;
    const totali = [];

    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      const descRaw = String(val(row, map.desc) || '');
      const dN = norm(descRaw);
      const lotto = String(val(row, map.lottoNoc) || val(row, map.lotto) || val(row, map.lottoImb) || '').trim();
      const qgiac = numv(row, map.qgiac);
      const qdisp = numv(row, map.qdisp);

      if (dN.startsWith('TOTALE')) {
        if (qgiac > 0 || qdisp > 0) totali.push({ desc: descRaw.trim(), giac: qgiac, disp: qdisp });
        continue;
      }
      if (dN.includes('CONTRATTIPER') || dN === 'SETTIMANADIPRODUZ' || dN === 'DATA') continue;
      const settCell = val(row, map.sett);
      if (!settCell && !lotto) continue;
      if (qgiac < 1) continue; // niente stock reale -> salta

      const sp = parseSettimana(settCell, annoRaccolta);
      let tipoRow = tipo;
      if (dN.includes('GIFFONI')) { giffoniN++; if (GIFFONI_DA_DESC) tipoRow = 'GIFFONI'; }
      const contoLav = isAssobio || norm(val(row, map.cliente)).includes('CONTOLAVORO');

      lotti.push({
        sett_prod: sp.sett_prod,
        anno: sp.anno,
        anno_raccolta: annoRaccolta,
        imballo: String(val(row, map.tipoImb) || val(row, map.lottoImb) || 'BIG BAG').trim(),
        lotto,
        desc1: tipoRow,
        desc2: detectLavorazione(descRaw, val(row, map.calibro)),
        desc3: detectCalibro(val(row, map.calibro), descRaw),
        q_iniz: qgiac,
        mov: Math.max(0, qgiac - qdisp),
        magazzino: detectMagazzino(row, map),
        mv: numv(row, map.mv), mo: numv(row, map.mo), cv: numv(row, map.cv),
        co: numv(row, map.co), ce: numv(row, map.ce), rt: numv(row, map.rt),
        conto_lavoro: contoLav,
        contratto: '', acquirente: '',
      });
      count++; sGiac += qgiac; sDisp += qdisp;
    }

    console.log('\n--- "' + sheetName + '" -> ' + tipo + ' (header r' + headerRow + ') ---');
    console.log('  lotti importabili: ' + count + ' | giacenza: ' + itk(sGiac) + ' kg | disponibili: ' + itk(sDisp) + ' kg');
    if (totali.length) {
      console.log('  TOTALI nel foglio (cross-check):');
      totali.forEach(t => console.log('    - ' + t.desc + ' -> giac ' + itk(t.giac) + ' / disp ' + itk(t.disp)));
    }
  }

  console.log('\n=== RIEPILOGO ' + filePath + ' ===');
  const tot = lotti.reduce((a, l) => ({ g: a.g + l.q_iniz, d: a.d + (l.q_iniz - l.mov) }), { g: 0, d: 0 });
  console.log('Lotti totali: ' + lotti.length + ' | Giacenza: ' + itk(tot.g) + ' kg | Disponibili: ' + itk(tot.d) + ' kg');
  const byT = {}; lotti.forEach(l => byT[l.desc1] = (byT[l.desc1] || 0) + 1);
  console.log('Per tipo: ' + Object.entries(byT).map(e => e[0] + '=' + e[1]).join(', '));
  const byL = {}; lotti.forEach(l => byL[l.desc2] = (byL[l.desc2] || 0) + 1);
  console.log('Per lavorazione: ' + Object.entries(byL).map(e => e[0] + '=' + e[1]).join(', '));
  if (giffoniN) console.log('Righe con "GIFFONI" in descrizione: ' + giffoniN + (GIFFONI_DA_DESC ? ' -> tipo GIFFONI' : ' -> tipo del foglio (GIFFONI_DA_DESC=false)'));
  const cl = lotti.filter(l => l.conto_lavoro);
  if (cl.length) {
    const clKg = cl.reduce((s, l) => s + l.q_iniz, 0);
    console.log('CONTO LAVORO (merce di terzi): ' + cl.length + ' lotti, ' + itk(clKg) + ' kg -> marcati conto_lavoro=true (esclusi dai totali di proprieta in app)');
    console.log('  di cui di proprieta Assofrutti: ' + (lotti.length - cl.length) + ' lotti, ' + itk(tot.g - clKg) + ' kg');
  }

  console.log('\nPrimi 5 lotti:');
  lotti.slice(0, 5).forEach((l, i) => console.log('  ' + (i + 1) + '. ' + l.desc1 + (l.conto_lavoro ? ' [C/LAV]' : '') + ' | ' + l.desc2 + ' | ' + l.desc3 + ' | ' + l.lotto + ' | ' + l.imballo + ' | ' + itk(l.q_iniz) + 'kg | racc.' + l.anno_raccolta + ' | ' + l.magazzino + ' | MO=' + (l.mo * 100).toFixed(1) + '% CO=' + (l.co * 100).toFixed(1) + '% RT=' + (l.rt * 100).toFixed(1) + '%'));

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
