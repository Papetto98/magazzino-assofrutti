/**
 * IMPORTA DATI — Magazzino Assofrutti
 * Carica i dati dal file Excel nel database Supabase.
 * 
 * USO:
 * 1. npm install xlsx dotenv
 * 2. Copia Magazzino_Nuovo.xlsm nella cartella
 * 3. node importa-dati.mjs
 */
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const FILE = 'Magazzino_Nuovo.xlsm';
const cl = v => v==null?'':String(v).trim();
const nm = v => {if(v==null||v==='')return 0;const n=Number(v);return isNaN(n)?0:n};
const dt = v => {if(!v)return null;if(v instanceof Date)return v.toISOString().split('T')[0];if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`}return String(v)};

async function main(){
  console.log('\n=== IMPORTAZIONE MAGAZZINO ASSOFRUTTI ===\n');
  
  // Test connessione
  const{error:te}=await supabase.from('lotti').select('id').limit(1);
  if(te){console.error('Errore connessione:',te.message);process.exit(1)}
  console.log('Connessione OK');

  let wb;
  try{wb=XLSX.read(readFileSync(FILE),{type:'buffer',cellDates:true})}
  catch(e){console.error('File '+FILE+' non trovato!');process.exit(1)}
  console.log('File aperto: '+wb.SheetNames.join(', '));

  // LOTTI
  const wl=XLSX.utils.sheet_to_json(wb.Sheets['LOTTI_MAGAZZINO'],{header:1,defval:''});
  const lotti=[];
  for(let i=1;i<wl.length;i++){const r=wl[i];if(!r[3]&&!r[4])continue;
    lotti.push({sett_prod:nm(r[0]),anno:nm(r[1]),imballo:cl(r[4]),lotto:cl(r[3]),desc1:cl(r[5])||'CONVENZIONALI',desc2:cl(r[6])||'SGUSCIATE',desc3:cl(r[7])||'9/11',q_iniz:nm(r[9]),mov:nm(r[10]),magazzino:cl(r[11])||'Fabrica',mv:nm(r[12]),mo:nm(r[13]),cv:nm(r[14]),co:nm(r[15]),ce:nm(r[16]),contratto:cl(r[18]),acquirente:cl(r[19])})}
  console.log('\nLotti: '+lotti.length);
  for(let i=0;i<lotti.length;i+=100){const b=lotti.slice(i,i+100);const{error}=await supabase.from('lotti').insert(b);if(error)console.error('Errore lotti:',error.message);else console.log('  '+Math.min(i+100,lotti.length)+'/'+lotti.length)}

  // CONTRATTI
  const wc=XLSX.utils.sheet_to_json(wb.Sheets['CONTRATTI_CLIENTI'],{header:1,defval:''});
  const contratti=[];const seen=new Set();
  for(let i=1;i<wc.length;i++){const r=wc[i];const id=cl(r[0]);if(!id||seen.has(id))continue;seen.add(id);
    contratti.push({id,desc1:cl(r[1])||'CONVENZIONALI',desc2:cl(r[2])||'SGUSCIATE',desc3:cl(r[3])||'9/11',cliente:cl(r[4]),scadenza:dt(r[5]),qta_tot:nm(r[8]),qta_evasa:nm(r[9])})}
  console.log('Contratti: '+contratti.length);
  for(const c of contratti){const{error}=await supabase.from('contratti').upsert(c);if(error)console.error('Errore contratto '+c.id+':',error.message)}
  console.log('  OK');

  // MOVIMENTI
  if(wb.Sheets['MOVIMENTI_MAGAZZINO']){
    const wm=XLSX.utils.sheet_to_json(wb.Sheets['MOVIMENTI_MAGAZZINO'],{header:1,defval:''});
    const movimenti=[];
    for(let i=1;i<wm.length;i++){const r=wm[i];const tipo=cl(r[0]).toUpperCase();if(!['ENTRATA','USCITA','TRASFERIMENTO'].includes(tipo))continue;
      movimenti.push({tipo,data:dt(r[1])||new Date().toISOString().split('T')[0],imballo:cl(r[7]),lotto:cl(r[6]),desc1:cl(r[8])||'CONVENZIONALI',desc2:cl(r[9])||'SGUSCIATE',desc3:cl(r[10])||'9/11',qta:nm(r[12]),magazzino:cl(r[13])||'Fabrica',contratto_id:''})}
    console.log('Movimenti: '+movimenti.length);
    for(let i=0;i<movimenti.length;i+=100){const b=movimenti.slice(i,i+100);const{error}=await supabase.from('movimenti').insert(b);if(error)console.error('Errore movimenti:',error.message);else console.log('  '+Math.min(i+100,movimenti.length)+'/'+movimenti.length)}
  }

  console.log('\n=== IMPORTAZIONE COMPLETATA ===');
  console.log('Apri l\'app nel browser per verificare!\n');
}
main().catch(e=>{console.error('Errore:',e.message);process.exit(1)});
