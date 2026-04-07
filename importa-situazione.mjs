// importa-situazione.mjs
// Script per importare il file Excel "SITUAZIONE AL..." usato in azienda
// Uso: node importa-situazione.mjs SITUAZIONE_AL_01_APRILE_2026.xlsx
//
// PREREQUISITI:
//   npm install xlsx @supabase/supabase-js dotenv
//   File .env con VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
//
// ATTENZIONE: questo script AGGIUNGE lotti. Se vuoi sovrascrivere,
// cancella prima i dati esistenti da Supabase.

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// === MAPPING FOGLI -> TIPO ===
const SHEET_TIPO = {
  'BIOLOGICO': 'BIOLOGICHE',
  'BIO FAIR FOR LIFE': 'FAIR FOR LIFE',
  'CONVENZIONALE': 'CONVENZIONALI',
  'BIO BIOSUISSE': 'BIOSUISSE',
};

// === FUNZIONI HELPER ===

function detectLavorazione(desc, calibro) {
  if (!desc) return 'SGUSCIATE';
  const d = String(desc).toUpperCase();
  const c = String(calibro || '').toUpperCase();
  
  // Controlla prima SCARTO (prima di ROTTAME perché entrambi possono avere "SCEGLIERE")
  if (d.includes('SCARTO')) return 'SCARTI';
  // ROTTAME nel calibro O nella descrizione
  if (c === 'ROTTAME' || d.includes('ROTTAME')) return 'ROTTAME';
  // DA SCEGLIERE con calibro SCARTO
  if (d.includes('SCEGLIERE') && c.includes('SCARTO')) return 'SCARTI';
  if (d.includes('SCEGLIERE') && c === 'ROTTAME') return 'ROTTAME';
  if (d.includes('SCEGLIERE')) return 'SGUSCIATE'; // default for DA SCEGLIERE
  // Default
  return 'SGUSCIATE';
}

function detectCalibro(calibro, desc) {
  if (!calibro) return 'DA SCEGLIERE';
  const c = String(calibro).trim().toUpperCase();
  
  // Standard calibri
  if (c === '9/11') return '9/11';
  if (c === '11/13') return '11/13';
  if (c === '13/15') return '13/15';
  
  // ROTTAME nel campo calibro = il calibro è "DA SCEGLIERE"
  if (c === 'ROTTAME') return 'DA SCEGLIERE';
  
  // SCARTO 11/13, SCARTO 13/15 etc
  if (c.includes('SCARTO')) {
    const match = c.match(/(\d+\/\d+)/);
    return match ? match[1] : 'DA SCEGLIERE';
  }
  
  // MISTO
  if (c === 'MISTO') return 'DA SCEGLIERE';
  
  // VENTILATO
  if (c.includes('VENTILATO') || c.includes('VENT')) return 'VENTILATO';
  
  return c || 'DA SCEGLIERE';
}

function detectMagazzino(row) {
  // Colonne: 12=Soriano, 13=Fabrica, 14=Vignanello, 15=Caprarola
  // Il magazzino è quello con un valore numerico > 0
  const sor = Number(row[11]) || 0; // col 12 (0-indexed = 11)
  const fab = Number(row[12]) || 0; // col 13
  const vig = Number(row[13]) || 0; // col 14
  const cap = Number(row[14]) || 0; // col 15
  
  if (vig > 0) return 'Vignanello';
  if (fab > 0) return 'Fabbrica';
  if (sor > 0) return 'Soriano';
  if (cap > 0) return 'Caprarola';
  return 'Vignanello'; // default
}

function parseSettimana(sett) {
  if (!sett) return { sett_prod: 0, anno: 2025 };
  const s = String(sett).trim();
  const parts = s.split('/');
  if (parts.length === 2) {
    return {
      sett_prod: parseInt(parts[0]) || 0,
      anno: parseInt(parts[1]) || 2025
    };
  }
  return { sett_prod: parseInt(s) || 0, anno: 2025 };
}

function isDataRow(row) {
  // Una riga è un lotto valido se ha:
  // - Settimana (col 1) O lotto nocciole (col 3)
  // - Quantità giacenza (col 6) > 0
  // - Non è un TOTALE, CONTRATTI PER, o header
  const sett = row[0];
  const lotto = row[2];
  const desc = String(row[3] || '').toUpperCase();
  const qta = Number(row[5]) || 0;
  const qtaDisp = Number(row[9]) || 0;
  
  if (!sett && !lotto) return false;
  if (qta <= 0 && qtaDisp <= 0) return false;
  if (desc.includes('TOTALE')) return false;
  if (desc.includes('CONTRATTI PER')) return false;
  if (desc === 'SETTIMANA DI PRODUZ.') return false;
  if (desc === 'DATA') return false;
  
  return true;
}

// === MAIN ===
async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: node importa-situazione.mjs <file.xlsx>');
    process.exit(1);
  }

  console.log(`\nLettura file: ${filePath}`);
  const wb = XLSX.readFile(filePath);
  
  const lotti = [];
  const contratti = [];
  const contrattiSeen = new Set();

  for (const sheetName of wb.SheetNames) {
    const tipo = SHEET_TIPO[sheetName];
    if (!tipo) {
      console.log(`  Foglio "${sheetName}" non riconosciuto, salto.`);
      continue;
    }

    console.log(`\n--- Foglio: ${sheetName} -> Tipo: ${tipo} ---`);
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    
    // Detect if col 19 is "Rott." (CONVENZIONALE) or "Cimiciato vis."
    const isConvenzionale = sheetName === 'CONVENZIONALE';
    
    let lottiCount = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!isDataRow(row)) continue;
      
      const { sett_prod, anno } = parseSettimana(row[0]);
      const lottoImballo = String(row[1] || '').trim();
      const lottoNocciole = String(row[2] || '').trim();
      const descrizione = String(row[3] || '').trim();
      const calibroRaw = String(row[4] || '').trim();
      const qtaGiacenza = Number(row[5]) || 0;
      const cliente = String(row[7] || '').trim();
      const nContratto = String(row[8] || '').trim();
      const qtaDisp = Number(row[9]) || 0;
      const tipoImballo = String(row[10] || '').trim();
      
      // Qualità
      const mv = Number(row[15]) || 0;  // Marcio vis
      const mo = Number(row[16]) || 0;  // Marcio Occ.
      const co = Number(row[17]) || 0;  // Cimiciato Occ.
      // Col 19 is "Rott.%" for CONVENZIONALE (extra data), "Cimiciato vis." for others
      const cv = isConvenzionale ? 0 : (Number(row[18]) || 0);  // Cimiciato vis. (0 for CONV)
      const rt = isConvenzionale ? (Number(row[18]) || 0) : 0;  // Rottame % (only CONV)
      const ce = Number(row[19]) || 0;  // Corpi estranei

      // Lavorazione e Calibro
      const lavorazione = detectLavorazione(descrizione, calibroRaw);
      const calibro = detectCalibro(calibroRaw, descrizione);
      const magazzino = detectMagazzino(row);
      
      // Determina se è assegnato
      const movimentato = qtaGiacenza - qtaDisp;  // la differenza è ciò che è già uscito
      const hasContratto = nContratto && nContratto !== '0' && nContratto !== '';
      
      const lotto = {
        sett_prod,
        anno,
        imballo: tipoImballo || lottoImballo || 'BIG BAG',
        lotto: lottoNocciole || lottoImballo,
        desc1: tipo,
        desc2: lavorazione,
        desc3: calibro,
        q_iniz: qtaGiacenza,
        mov: Math.max(0, movimentato),
        magazzino,
        mv, mo, cv, co, ce, rt,
        contratto: hasContratto ? nContratto : '',
        acquirente: cliente || '',
      };

      // Skip if no meaningful data
      if (!lotto.lotto && !lotto.imballo) continue;
      
      lotti.push(lotto);
      lottiCount++;

      // Collect contratti
      if (hasContratto && !contrattiSeen.has(nContratto)) {
        contrattiSeen.add(nContratto);
        const qtaContratto = Number(row[6]) || qtaGiacenza;
        contratti.push({
          id: nContratto,
          desc1: tipo,
          desc2: lavorazione,
          desc3: calibro,
          cliente: cliente || 'N/D',
          qta_tot: qtaContratto,
          qta_evasa: 0,
          scadenza: null,
        });
      }
    }
    
    console.log(`  ${lottiCount} lotti trovati`);
  }

  console.log(`\n=== RIEPILOGO ===`);
  console.log(`Lotti totali: ${lotti.length}`);
  console.log(`Contratti trovati: ${contratti.length}`);
  
  // Breakdown per tipo
  const byTipo = {};
  lotti.forEach(l => { byTipo[l.desc1] = (byTipo[l.desc1] || 0) + 1; });
  Object.entries(byTipo).forEach(([t, n]) => console.log(`  ${t}: ${n} lotti`));
  
  // Breakdown per lavorazione
  const byLav = {};
  lotti.forEach(l => { byLav[l.desc2] = (byLav[l.desc2] || 0) + 1; });
  Object.entries(byLav).forEach(([l, n]) => console.log(`  ${l}: ${n} lotti`));

  // Show first 5 for verification
  console.log(`\nPrimi 5 lotti (verifica):`);
  lotti.slice(0, 5).forEach((l, i) => {
    console.log(`  ${i+1}. ${l.desc1} | ${l.desc2} | ${l.desc3} | ${l.lotto} | ${l.imballo} | ${l.q_iniz}kg | ${l.magazzino} | MV=${(l.mv*100).toFixed(1)}% MO=${(l.mo*100).toFixed(1)}% CO=${(l.co*100).toFixed(1)}% RT=${(l.rt*100).toFixed(1)}%`);
  });

  // Ask for confirmation
  console.log(`\nVuoi procedere con l'importazione in Supabase? (i dati NON vengono cancellati, vengono aggiunti)`);
  console.log(`Per procedere, esegui: node importa-situazione.mjs ${filePath} --conferma`);

  if (!process.argv.includes('--conferma')) {
    console.log('\nDry run completato. Nessun dato importato.');
    return;
  }

  // === IMPORTAZIONE ===
  console.log('\n--- IMPORTAZIONE IN CORSO ---');

  // Insert lotti in batches
  let inserted = 0;
  for (let i = 0; i < lotti.length; i += 50) {
    const batch = lotti.slice(i, i + 50);
    const { error } = await supabase.from('lotti').insert(batch);
    if (error) {
      console.error(`Errore batch ${i}: ${error.message}`);
    } else {
      inserted += batch.length;
      console.log(`  Lotti inseriti: ${inserted}/${lotti.length}`);
    }
  }

  // Insert contratti
  if (contratti.length > 0) {
    for (const c of contratti) {
      const { error } = await supabase.from('contratti').upsert(c, { onConflict: 'id' });
      if (error) console.error(`Errore contratto ${c.id}: ${error.message}`);
    }
    console.log(`  Contratti inseriti: ${contratti.length}`);
  }

  console.log(`\n=== IMPORTAZIONE COMPLETATA ===`);
  console.log(`${inserted} lotti importati`);
  console.log(`${contratti.length} contratti importati`);
}

main().catch(console.error);
