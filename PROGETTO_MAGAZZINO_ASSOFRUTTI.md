# PROGETTO MAGAZZINO ASSOFRUTTI — Documento di Continuità

> Incolla questo file tra le istruzioni di una nuova chat (o caricalo come allegato) per dare a Claude tutto il contesto necessario a continuare lo sviluppo. Allega SEMPRE anche l'ultima versione di `src/App.jsx`. Eventuali nuove colonne/modifiche al DB vanno comunicate.

---

## 1. COSA È

Web app multi-utente per la gestione del magazzino di nocciole semilavorate di **Assofrutti S.r.l.** (cooperativa zona Caprarola/Soriano). Sostituisce un vecchio file Excel/VBA (`Magazzino_Nuovo.xlsm`) che non supportava più utenti contemporaneamente.

L'utente principale è **Gabriele** (admin: gabriele.cristofori98@gmail.com). Il CEO usa l'app soprattutto per **visualizzare** e selezionare lotti in base alle **percentuali di Marcio Occulto (M.O.) e Cimiciato Occulto (C.O.)**. Esiste anche un trasformatore esterno **ABC Service** (Assofrutti ne detiene il 30%) dove avvengono le trasformazioni.

## 2. STACK E INFRASTRUTTURA

- **Frontend**: React + Vite, architettura **single-file** `src/App.jsx` (tutto inline, righe lunghe/minificate).
- **Database**: Supabase (PostgreSQL + Auth, regione Frankfurt).
- **Hosting**: Vercel → `magazzino-assofrutti.vercel.app`.
- **Repo**: `github.com/Papetto98/magazzino-assofrutti.git` (privato).
- **CI/CD**: GitHub Actions — keep-alive (ping giornaliero a Supabase, **committa su main** alle 6:00 UTC) + backup notturno CSV (`backup.mjs`, Supabase REST + service role key) in `backups/YYYY-MM-DD/`.
- **Costo**: zero (tutto free tier). **Ruoli**: `admin` / `operatore` (Supabase Auth + RLS).
- **Dipendenze npm aggiunte**: `jspdf` + `jspdf-autotable` (resoconti/etichette PDF), `qrcode` (genera QR), `html5-qrcode` (scansione fotocamera, **caricata in lazy/import dinamico**).

### Workflow di rilascio (SEQUENZA GIT — usarla SEMPRE, riportarla ad ogni consegna)
**Regola d'oro:** gli script SQL e gli `ALTER TABLE` si eseguono su Supabase **PRIMA** del push; gli import con `--conferma` **DOPO**.
```bash
cd magazzino-assofrutti
git add <file elencati uno per uno, es. src/App.jsx>
git commit -m "<messaggio adatto alle modifiche>"
git pull --rebase origin main
git push origin main
```
In caso di conflitti (di solito sul commit keep-alive): risolvere, poi `git rebase --continue` e `git push origin main`. Per annullare: `git rebase --abort`.
Vercel fa il deploy automatico al push.

**Feature rischiose → branch dedicato** (es. `feature-qr`): `git checkout -b feature-qr`, push del branch → Vercel crea un **URL di anteprima separato** (`...-git-feature-qr-...vercel.app`) per collaudare senza toccare la produzione. Merge quando ok: `git checkout main && git merge <branch> && git push origin main`. Rollback merge: `git revert -m 1 <hash-merge>`. Branch buttato: `git branch -D <branch>`.

### ⚠️ Inciampo storico di ambiente (Mac di Gabriele)
Esiste(va) un **git repo "parassita" nella cartella superiore** `Desktop/Magazzino semilavorati/` (branch `master`, **senza** remote): commit dati da lì finivano nel vuoto. **Lavorare SEMPRE dentro** `Desktop/Magazzino semilavorati/magazzino-assofrutti/` (prompt che finisce con `magazzino-assofrutti %`). L'`App.jsx` va in `src/App.jsx`: verificare con `grep -c "<stringa-nuova>" src/App.jsx` (>0) e `git status` (deve vedere `modified: src/App.jsx`) PRIMA del commit. Il repo vero ha `origin → Papetto98/magazzino-assofrutti` e branch `main`.

## 3. SCHEMA DATABASE (Supabase)

**Tabella `lotti`**: id, sett_prod, anno, **anno_raccolta**, imballo, lotto, desc1 (tipo), desc2 (lavorazione), desc3 (calibro), q_iniz, mov, magazzino, mv, mo, cv, co, ce, **rt**, contratto, acquirente, lotto_padre, **conto_lavoro**.
- Qualità (mv/mo/cv/co/ce/rt) sono **decimali**: 2% = `0.02`. Dividere per 100 al salvataggio, moltiplicare per 100 al caricamento form. (L'import scrive già i decimali.)
- Disponibilità = `q_iniz - mov`.
- `rt` (rottame %): `ALTER TABLE lotti ADD COLUMN IF NOT EXISTS rt numeric DEFAULT 0;`
- **`anno_raccolta`** (crop / annata di raccolta, integer): `ALTER TABLE lotti ADD COLUMN IF NOT EXISTS anno_raccolta integer;` — distinto da `anno`/`sett_prod` che sono la **lavorazione**.
- **`conto_lavoro`** (boolean, merce di terzi): `ALTER TABLE lotti ADD COLUMN IF NOT EXISTS conto_lavoro boolean DEFAULT false;` (file `conto_lavoro.sql`).
- **`lotto_padre`** (nullable): id del lotto di provenienza (trasformazione o split di trasferimento parziale). Per N→1 = primo input (retro-compatibilità); la parentela completa è nella tabella ponte.

**Tabella `trasformazione_input`** (parentela multipla N→1): id, figlio_id (FK lotti ON DELETE CASCADE), padre_id (FK lotti ON DELETE CASCADE), qta, created_at. File `trasformazione_multi.sql`.

**Tabella `contratti`**: id, desc1, desc2, desc3, cliente, qta_tot, qta_evasa, scadenza.

**Tabella `movimenti`**: id, tipo (ENTRATA/USCITA/TRASFERIMENTO/**TRASFORMAZIONE**), data, imballo, lotto, desc1, desc2, desc3, qta, magazzino, contratto_id, lotto_id, utente, **ddt**.
- TRASFERIMENTO: `contratto_id` riusato per il **magazzino sorgente** (full) o `"SPLIT|"+sorgente` (parziale); serve per annullare.
- TRASFORMAZIONE: `contratto_id` = `"TRASF:"+figlio_id` su OGNI riga di scarico padre (collega lo scarico al lotto prodotto).
- **`ddt`** (text): numero DDT su Uscite e Trasferimenti: `ALTER TABLE movimenti ADD COLUMN IF NOT EXISTS ddt text;` (file `ddt.sql`, idempotente).

**Tabella `user_profiles`**: id, email, nome, ruolo (admin/operatore) — con RLS e trigger.

### RPC atomiche (concorrenza multi-utente)
- `incrementa_mov(lid, q)` — incrementa `mov` di un lotto (anche negativo per annullare).
- `incrementa_evasa(cid, q)` — incrementa `qta_evasa` di un contratto.
- `trasforma_multi(p_inputs jsonb, …)` — **N→1 atomica** (security definer): valida/blocca i padri (FOR UPDATE), crea il figlio, registra parentela in `trasformazione_input` e i movimenti. `p_inputs` = `[{"padre_id":1,"qta":100}, …]`. **Ritorna l'id del figlio** (usato dal client).

## 4. VALORI DROPDOWN E COSTANTI

- **TIPO (desc1)**: CONVENZIONALI, BIOLOGICHE, FAIR FOR LIFE, BIOSUISSE, GIFFONI (mappa colori `TC`).
- **LAVORAZIONE (desc2)**: divise in due famiglie nel codice:
  - **Naturali** → `NAT_LAV = ["SGUSCIATE","ROTTAME","SCARTI"]`.
  - **Semilavorati** → `TRASF = ["TOSTATE","GRANELLA","FARINA","PASTA"]` (prodotti c/o ABC Service dalla trasformazione).
  - `LAVS` = tutte; ordinamento via `LAV_ORD`.
- **CALIBRO (desc3)**: 9/11, 11/13, 13/15, DA SCEGLIERE, VENTILATO, PICCOLO, GRANDE, GRANELLA, FARINA, PASTA (ord. `CAL_ORD`).
- **MAGAZZINO**: `MAGS = ["Caprarola","Soriano","Fabbrica","Vignanello","ABC Service"]`.
- **`CAP`** (capienza magazzini in kg, per la % riempimento dashboard): `{Caprarola:null, Soriano:null, Fabbrica:null, Vignanello:null, "ABC Service":null}`. **DA COMPILARE coi valori reali** (null = mostra "n/d").
- **QR**: `QR_PREFIX = "ASSOFRUTTI:"`; payload etichetta = `ASSOFRUTTI:<id-lotto>`.
- **`LABEL`** (formato etichetta DYMO in mm): `{w:101.6, h:54}` (default DYMO 99014). **Da adeguare alla misura reale delle etichette in uso.**

## 5. CROP / LAVORAZIONE / CAMPAGNA

- `anno_raccolta` = **annata di raccolta** del prodotto (crop). Vincolo: **un lotto = una sola crop** (mono-annata).
- `anno` / `sett_prod` = anno e settimana di **lavorazione** (rietichettati "Anno/Sett. lavoraz." in UI).
- Il selettore **Campagna** globale filtra `anno_raccolta`, con **fallback** su `anno` per i lotti legacy senza crop.
- Entrata: campo "Annata raccolta" (default = campagna corrente `CAMP()`), settimana lavoraz. precompilata con settimana ISO (`ISOW()`).
- Trasformazione: il figlio prende anno/sett lavorazione dalla **data di trasformazione**, eredita `anno_raccolta` dal/i padre/i. Lo split di trasferimento eredita la crop.

## 6. SISTEMA QUALITÀ (niente indice ponderato)

Il CEO ha **rifiutato l'indice ponderato**. Decisioni sulle **percentuali dirette** di M.O. e C.O. Sistema = **4 gruppi** per fascia:
- Gruppo 0: 0–2% (verde) · Gruppo 1: 2–4% (arancione) · Gruppo 2: 4–6% (rosso) · Gruppo 3: >6% (rosso scuro)

Costanti: `GRP_L`/`GRP_D` (temi), `var GRP` (switcha col tema). `grp(v)` → indice gruppo; `moP(l)`/`coP(l)` → percentuale (×100); `pct(dec)` → stringa "x,xx%". `calcSub(items)` per i subtotali (ritorna `{t,n,mv,mo,cv,co,ce,rt}`). **Medie qualità SEMPRE pesate sui kg**, mai medie aritmetiche semplici.

## 7. CONTO LAVORO (merce di terzi)

Lotti `conto_lavoro=true` = merce **non di proprietà** Assofrutti (es. foglio "Merce ASSOBIO" dell'Excel, importata come **CONVENZIONALI** ma marcata conto lavoro; ~10.950 kg nel 2024).
- **Dashboard**: i totali di proprietà (Giacenza Totale, per magazzino di proprietà, per tipo) **escludono** il conto lavoro; KPI separata "Conto Lavoro" (cliccabile → Giacenze filtrate). NB: l'**occupazione** delle card magazzino INCLUDE il conto lavoro (occupa spazio fisico).
- **Giacenze**: chip **Proprietà / Conto lavoro** (default solo proprietà) + badge **C/LAV** sui lotti di terzi.
- **Entrata**: checkbox **"Merce in conto lavoro (di terzi)"** (`form.cl` → `conto_lavoro`). Default off; si azzera dopo ogni entrata.

## 8. TRASFORMAZIONE MOLTI-A-UNO (N→1)

ABC Service combina più lotti/big bag in un unico lotto prodotto (es. più big bag → granella).
- UI: selezione **multipla** dei padri (qta per input), tipo **bloccato** sul tipo comune (no mix certificazioni), magazzino default **ABC Service modificabile**, kg figlio a mano (default = somma input), **calo/resa** mostrati.
- **Selezione: di default solo i lotti "da trasformare"** (naturali a ABC). Chip **"Includi semilavorati"** (default spento) per ri-trasformare i semilavorati (es. GRANELLA → FARINA). Filtro Magazzino rimosso (è sempre ABC).
- **ABC assegna solo il LOTTO, non l'imballo**: il campo "Imballo prodotto" è stato **rimosso**; il figlio nasce con `imballo` vuoto (obbligatorio solo "Lotto prodotto"). In `handleTrasf`/`trasforma_multi` → `p_imballo:""`.
- Crop: ereditata se i padri condividono l'annata; se diverse, **selettore** tra le annate dei padri.
- Qualità figlio: vuota/manuale + bottone **"Compila con media pesata"** (MV/MO/CV/CO/CE; RT escluso). Pannello **tracciabilità padri**.
- **DDT andata ABC**: NON si reinserisce in trasformazione. La tracciabilità lo **pesca dal movimento TRASFERIMENTO** con cui ogni padre è stato spostato a "ABC Service" (per `lotto_id`). Quindi il flusso atteso è: **Trasferimento del lotto verso ABC (con DDT) → poi Trasformazione**.
- Annulla: deterministico via `contratto_id="TRASF:"+figlio_id`; ripristina `mov` su TUTTI i padri ed elimina il figlio; tabella ponte in cascade.
- `handleTrasf` separato da `handleSubmit`. Tutta l'operazione passa per la RPC `trasforma_multi`.

## 9. TRACCIABILITÀ SEMILAVORATI (componente `Tracciabilita`)

Mostra i **lotti padre diretti** di un lotto figlio (legge `trasformazione_input` + `lotto_padre` legacy) con kg scaricati e qualità completa, più il **DDT andata ABC** pescato dai trasferimenti dei padri verso ABC Service.
- In **Giacenze**: bottone `↳ info` sui lotti figli → pannello con riepilogo lotto (kg, lav/cal, magazzino, contratto, qualità) + padri.
- In **Storico Movimenti**: stesso pannello sotto i parametri del lotto selezionato.
- Anche aperto da **scansione QR** in lettura (vedi §13).

## 10. DASHBOARD (due sezioni: Naturali / Semilavorati)

`DashboardPage` riceve anche `movimenti` (serve per le rese).
- **KPI**: Giacenza Totale, (Semilavorati se >0), Contratti Aperti, Conto Lavoro; **card per magazzino** con **barra % capienza** (verde/arancio/rosso oltre 75/90%; occupazione include conto lavoro; "n/d" se `CAP` null).
- **Naturali · Dettaglio per Tipologia**: per ogni tipo, sgusciato per calibro (medie M.O./C.O.), gruppi qualità, rottame, scarti. Tutto cliccabile → Giacenze filtrate.
- **Semilavorati · c/o ABC Service**: aggregati per prodotto (TOSTATE/GRANELLA/FARINA/PASTA) con kg, n. lotti, ripartizione per certificazione.
- **Rese di trasformazione** (reportistica scarto): legge i movimenti TRASFORMAZIONE (raggruppa per `contratto_id="TRASF:"+figlio`), calcola per prodotto input/output/**calo**/resa% pesata. Il calo è una **perdita** di lavorazione, NON merce a magazzino.
- **Resoconto PDF + Excel** (pulsanti in alto): `genPDF()` (jsPDF + autoTable, impaginato) e `genExcel()` (XLSX multi-foglio: Riepilogo, Naturali, Semilavorati, Rese, Dettaglio giacenze).

## 11. PAGINE E PERMESSI

| Pagina | Operatore | Admin |
|---|---|---|
| Dashboard, Giacenze, Ricerca, Storico, Storico Mov. | Sì | Sì |
| Entrata (nuovo lotto) / Trasformazione N→1 | Sì | Sì |
| Uscita / Trasferimento / Assegnazione su selezione (Giacenze) | Sì | Sì |
| Scanner (lettura QR + lista azioni: vendi **o** trasferisci) | Sì | Sì |
| Controllo semilavorati (verifica trasformazioni, cali, rese — sola lettura) | Sì | Sì |
| Annulla movimento (Storico Mov.) | Sì | Sì |
| Export Excel / Stampa / Resoconto PDF-Excel / Etichette QR / Scanner | Sì | Sì |
| Registro DDT (elenco, ristampa PDF) | Sì | Sì |
| Contratti: crea/modifica/elimina | No | Sì |
| Lotti: modifica/elimina | No | Sì |
| Utenti: crea/gestisci ruoli | No | Sì |

## 12. AZIONI (Entrata, Trasformazione, Giacenze, Scanner)

**"Movimenti" come contenitore NON esiste più.** È diviso in due voci di menu separate: **Entrata** e **Trasformazione** (stesso componente `MovimentiPage` con prop `mode`; niente più barra dei tab; titolo dinamico). Uscita e Trasferimento sono diventati **azioni sulla selezione in Giacenze**. Big-bag-in-mano → **Scanner** (pagina dedicata).

> ⚠️ Le due voci montano lo stesso componente nella stessa posizione: serve **`key="entrata"`/`key="trasformazione"`** nelle rotte, altrimenti React riusa l'istanza e lo stato `tipo` non cambia (bug del cambio-pagina). La `key` forza il remount.

- **Entrata** (`mode="ENTRATA"`): form completo (tutti i campi qualità incluso RT) + checkbox conto lavoro + banner **"Stampa etichetta"** del lotto appena creato.
- **Trasformazione** (`mode="TRASFORMAZIONE"`): vedi §8.
- **Uscita (Giacenze)**: selezione multipla → "Uscita selezionati", **DDT obbligatorio**, data = oggi.
- **Trasferimento (Giacenze)**: selezione multipla → "Trasferisci selezionati" → pannello con **kg per lotto** (default = disponibile), **destinazione unica**, **DDT obbligatorio**, data = oggi. Parziale → split tracciato (`lotto_padre`, `contratto_id="SPLIT|"+sorgente`); totale → sposta magazzino. `doBulkTransfer` in `GiacenzePage` (stati `tMode`/`tMag`/`inQ`). Assegna e Trasferisci sono mutuamente esclusivi.
- **Scanner**: vedi §13.
- **DDT obbligatorio** su TUTTE le uscite e i trasferimenti (Giacenze + Scanner); colonna **DDT in Storico Movimenti** ed export. Entrata e Trasformazione senza DDT manuale.

## 13. QR / ETICHETTE BIG BAG (feature `feature-qr`, merged in main)

Un big bag fisico = una riga `lotti`. Etichettatura reale: lotto + numero big bag.
- **Etichette DYMO** (`stampaEtichette(lots)`): PDF jsPDF, una etichetta per pagina (formato `LABEL` mm), con **QR + lotto + big bag + tipo + calibro** (niente magazzino/qualità). Da Giacenze (selezionati → "Etichette (N)"), dal pannello info singolo, e dal banner post-Entrata. Stampa via dialogo di sistema sulla DYMO.
- **Scanner = pagina dedicata** (`ScannerPage`; i pulsanti "Scansiona QR" sparsi in Giacenze/Movimenti sono stati **rimossi**). Usa `Scanner` (html5-qrcode in **import dinamico**), fotocamera, HTTPS (Vercel ok) + permesso browser. `parseQR(txt)` valida il prefisso e ritorna l'id; il lotto si risolve sul `lotti` **completo** (non filtrato per campagna), così ogni big bag è leggibile.
  - Inquadri → **scheda completa** del big bag: identità, disponibilità residua, magazzino, contratto/cliente, qualità, **storico movimenti del big bag** (anche se già uscito/trasferito), tracciabilità se figlio, stampa etichetta.
  - Modello **lista (carrello)**: accodi più big bag, scegli **UNA** azione per il blocco — **Vendi** *oppure* **Trasferisci** (`action` unica) — con **un solo DDT** (kg per voce, parziale ammesso). `doVendi`/`doTrasf` rispecchiano la logica uscita/trasferimento di Giacenze; data = oggi.
  - **Lotti a ABC Service**: info/storico/tracciabilità/etichetta **sempre** visibili, ma **azione bloccata** (`blocked = magazzino==="ABC Service"`) — da relax se si vorrà vendere/trasferire i semilavorati finiti via Scanner.
- **Nessuna modifica al DB**: il QR usa l'`id` esistente.

## 14. UX MOBILE (gate `isMobile`, PC invariato)

Hook `useIsMobile(768)`. **Tutto il layout mobile è dietro al gate**: sopra i 768px il codice desktop è invariato (zero regressioni su PC).
- **Fase 1 — shell**: sidebar → **drawer a scomparsa** (hamburger in top bar, overlay con backdrop, voci/Campagna/tema/utente/Aggiorna/Esci dentro), contenuto full-width, padding ridotto. Stato `drawer`.
- **Fase 2**: tab Movimenti a **griglia 2×2** su mobile (prima "TRASFORMAZIONE" usciva dallo schermo); **Giacenze a schede** (una card per lotto: tipo, lotto, kg, imballo·lav·cal·magazzino, M.O./C.O./RT; tap = seleziona; `↳ info`; sottototali come intestazioni di sezione). Il `Tbl` desktop ha già `overflow:auto` (scroll orizzontale).
- Componenti che leggono `mob`: App (shell), MovimentiPage (tab), GiacenzePage (card view).

## 15. IMPORT DATI (`importa-situazione.mjs`)

Import dai file Excel aziendali, **uno per annata di raccolta**, **mappatura colonne guidata dalle INTESTAZIONI** (gestisce i 3 layout reali).
- **`anno_raccolta`** dal **NOME FILE** (`2025.xlsx`/`2024.xlsx`; override `--annata=YYYY`; nome ambiguo → si ferma).
- **Fogli → tipo**: BIOLOGICO→BIOLOGICHE, BIO FAIR FOR LIFE→FAIR FOR LIFE, CONVENZIONALE→CONVENZIONALI, BIO BIOSUISSE→BIOSUISSE, **Merce ASSOBIO→CONVENZIONALI + conto_lavoro=true**.
- **GIFFONI** da descrizione; **SCARTI** riconosciuti anche da "SCARTO 13/15" in colonna calibro.
- **Magazzino** dalla colonna valorizzata; "ALTRI MAGAZZINI" → `ABC Service`.
- Salta righe TOTALE/CONTRATTI/header/vuote e con giacenza < 1 kg. NON importa contratti né acquirenti.
- **Riconciliazione** stampata + cross-check coi TOTALI Excel: 2025 = **358.315 kg**; 2024 proprietà = **48.505 kg** (+ 10.950 kg conto lavoro ASSOBIO).
- Uso: `node importa-situazione.mjs 2025.xlsx` (dry run) → `--conferma`. **Eseguire `conto_lavoro.sql` PRIMA**.

## 16. BUG STORICI / REGOLE TASSATIVE

1. **`var C = LIGHT`** a livello modulo — MAI `let`/`const` per `C` (TDZ Vite). Stessa cosa per `var GRP`.
2. **`LIGHT.zebra` = letterale `"#faf8f4"`**, MAI `C.zebra` dentro LIGHT (riferimento circolare).
3. **Qualità ÷100 / ×100** in salvataggio/caricamento form.
4. **Niente `sed` su App.jsx** (rompe JSX). Solo `str_replace` mirato (anchor univoci!).
5. **Uscita multipla su stesso contratto**: accumulatore locale / RPC `incrementa_evasa`.
6. **Annulla Entrata**: cancellare per `id` singolo, mai con `.match()`.
7. **Annulla Trasferimento**: sorgente in `movimenti.contratto_id` (full = nome mag.; parziale = `"SPLIT|"+mag`).
8. **Annulla Trasformazione**: via `contratto_id="TRASF:"+figlio_id`; ripristina mov su TUTTI i padri.
9. **Subtotali giacenze**: raggruppare per tipo→lav→calibro.
10. **Stato `loading`**: disabilitare i submit durante async.
11. **Concorrenza quantità**: usare le RPC atomiche, non read-modify-write lato client.
12. **Medie qualità pesate sui kg**.
13. **Multi-trasferimento**: ogni lotto sorgente loopato con `incrementa_mov`; parziale crea split, totale aggiorna magazzino. (Il vecchio trasferimento single-lot era un bug.)
14. **Mobile = solo dietro `isMobile`**: mai toccare i path desktop, così PC resta identico.
15. **QR = `ASSOFRUTTI:<id>`**: nessuna colonna nuova; non cambiare lo schema per la feature QR.
16. **`LABEL` (etichette DYMO)**: va impostato alla misura reale; default 101.6×54 mm.
17. **Validare sempre** il file con esbuild prima della consegna (`npx esbuild App.jsx --bundle --loader:.jsx=jsx --external:react --external:./supabase --external:xlsx --external:html5-qrcode --format=esm --outfile=/dev/null`).

## 17. PREFERENZE DI LAVORO DI GABRIELE

- **Progettare prima di implementare**: per feature complesse, Q&A strutturato per bloccare le decisioni di dominio prima di scrivere codice.
- Ricevere **solo `src/App.jsx`** quando è l'unico file che cambia; SQL come file `.sql` separati con istruzioni "eseguire prima del push".
- Raccogliere tutte le richieste in un unico messaggio. Risposte concise.
- **Ad ogni rilascio, riportare SEMPRE la sequenza Git completa** (§2) con messaggio di commit adatto.
- Feature rischiose su **branch dedicato** con anteprima Vercel.

## 18. STATO ATTUALE (tutto deployato in produzione)

Questa sessione ha consegnato e deployato:
1. **Multi-trasferimento** (fix del bug single-lot).
2. **DDT obbligatorio** su uscite/trasferimenti + colonna in Storico Mov + export (`ddt.sql`).
3. **Tracciabilità semilavorati** (pannello padri in Giacenze e Storico Mov).
4. **DDT andata ABC** pescato dal trasferimento del padre verso ABC (no reinserimento in trasformazione).
5. **Dashboard a due sezioni** (Naturali / Semilavorati).
6. **Capienza magazzini** (% riempimento; valori `CAP` ancora da popolare).
7. **Rese di trasformazione** (reportistica scarto/calo).
8. **Resoconto PDF + Excel**.
9. **Checkbox conto lavoro** manuale in Entrata.
10. **UX mobile Fase 1 + 2** (drawer nav, tab 2×2, Giacenze a schede; gate `isMobile`).
11. **Feature QR** (etichette DYMO, scansione in lettura, scansione-per-agire) — merged da `feature-qr`.

**Sprint successivo (refactor azioni & menu):**
12. **Uscita/Trasferimento spostati in Giacenze** come azioni sulla selezione (`doBulkTransfer`); rimossi `handleMulti`/`handleMultiTransfer` da Movimenti.
13. **Scanner** = pagina dedicata (info + lista vendi/trasferisci, una sola azione per blocco); rimossi i pulsanti scan sparsi.
14. **"Movimenti" diviso** in **Entrata** e **Trasformazione** (prop `mode` + `key` per-rotta).
15. **Trasformazione**: selezione solo "da trasformare" + chip "Includi semilavorati"; **imballo prodotto rimosso** (solo lotto).
16. **Nuova pagina "Controllo semilavorati"** (`ControlloSemiPage`): verifica per trasformazione di input/output/**calo**/**resa%** + DDT andata ABC + tracciabilità espandibile; riepiloghi per prodotto e totale periodo; filtri annata/prodotto. **Ricostruita dai movimenti `TRASFORMAZIONE` (`contratto_id="TRASF:"+figlio`) — nessuna modifica al DB.**

## 19. ROADMAP / IN SOSPESO

- **Valori capienza `CAP`**: inserire i kg reali dei magazzini (oggi `null` → "n/d").
- **`LABEL` etichette**: confermare/adeguare la misura reale delle etichette DYMO.
- **Git/keep-alive**: il commit keep-alive (6:00 UTC) su main costringe al `pull --rebase` quotidiano. Valutare branch separato o cambio orario, insieme al backup notturno.
- **Hardening `lotti_guard`** (opzionale): `anno_raccolta` admin-only a livello DB (serve `rls_policies.sql`, non ancora disponibile).
- **UX mobile — eventuale Fase 3** (solo se usata da telefono): altre tabelle a schede (Storico Mov., Ricerca, Contratti), form lunghi a colonna singola.
- **Idea "next big thing" discussa**: assistente di allocazione lotti per contratto (FIFO per annata, minimizza la qualità "regalata") — potenziamento, non fondante.
- **Scanner su lotti ABC**: oggi l'azione è bloccata per `magazzino==="ABC Service"`. Da decidere se permettere vendita/trasferimento dei **semilavorati finiti** direttamente dallo Scanner (relax di `blocked`).
- **Date azioni bulk/Scanner**: usano **oggi** (come l'uscita rapida). Valutare date-picker se serve retrodatare uscite/trasferimenti.
- **"Rese di trasformazione" in Dashboard**: ora c'è la pagina dedicata "Controllo semilavorati"; valutare se rimuoverla dalla Dashboard per evitare doppioni.
- **Backlog P2/P3**: micro-rifiniture UX (la revisione da PC è già fatta).

> **Per continuare in una nuova chat**: incolla questo MD + allega l'ultima `src/App.jsx`. Comunica eventuali nuove colonne/modifiche al DB.


---

## 20. PARTNER (anagrafica controparti) + TRACCIABILITÀ STATO

**Partner** (`partner.sql`): tabella `partner`(id, nome, attivo) + colonna `lotti.partner_id` (nullable, FK). Una stessa azienda puo' essere sia committente conto lavoro sia cliente intragruppo (nessun campo "tipo": compare in entrambe le tendine). RLS permissiva per autenticati (pagina riservata admin lato UI). `loadAll` carica i partner con fetch **resiliente** (se la tabella non esiste ancora l'app non si rompe, partner=[]).
- **Pagina Partner** (`PartnerPage`, solo admin): aggiungi / rinomina / attiva-disattiva (disattivare invece di eliminare per non perdere i riferimenti storici).
- Tendina partner in: **Entrata** (committente, se conto lavoro), **azione Intragruppo in Giacenze** (cliente), **modifica Lotto**. Nome partner accanto ai badge C/LAV e INTRAGR. (tabella, card mobile, pannello info Giacenze).
- **Filtro Partner** in Giacenze e in Lotti → risponde a "quanto ho verso/da X".

**Modifica lotto — stato merce + partner** (LottiPage): selettore *Di proprieta / Conto lavoro / Intragruppo* + tendina partner. **Ogni cambio di stato intragruppo viene loggato** in `movimenti` (INTRAGRUPPO/RIENTRO) con `nota="da modifica lotto — ..."` (sul rientro registra il partner di provenienza). Cosi' ogni transizione e' rintracciabile e annullabile dallo Storico.

**Colonna `movimenti.nota`** (`nota_mov.sql`): testo di tracciabilita'. Mostrata in Storico Movimenti (colonna Nota) ed export. L'azione Intragruppo/Rientro in Giacenze scrive in nota il cliente / "rientro da <partner>".

**Dashboard — interruttore Fisica / Proprieta** (default **Fisica**): in alto, gemello del resoconto. `av` (e quindi totali e dettaglio per tipologia) segue la vista; le KPI Conto Lavoro e Intragruppo restano come scomposizione. Card "Giacenza" con label dinamica e sottotitolo esplicito ("include intragr. e c/lavoro" / "solo proprieta"). L'occupazione magazzini resta sempre fisica.

**Filtri Lotti ampliati**: ricerca lotto (testo) + Lavorazione, Calibro, Magazzino, Merce (proprieta/CL/intragruppo), Partner, oltre a Tipo/Stato/Campagna, con Pulisci.

**Resoconto — riquadro a scomposizione** (§10, aggiornato): vista **contabile** = solo proprieta (nessuna riga/colonna intragruppo o conto lavoro); vista **fisica** = colonne Proprieta / +Intragruppo / +Conto lavoro / =Fisico con **colonne vuote nascoste**; dettaglio per tipologia con colonna "di cui intragr." solo in fisica. Invariante verificata: Proprieta + Intragruppo + Conto lavoro = Fisico.

**SQL di questo blocco (eseguire PRIMA del push):** `partner.sql`, `nota_mov.sql`.


---

## 21. SESSIONE "RIFINITURA RESOCONTO + CORREZIONE INTRAGRUPPO + CONTRATTI"

### 21.1 Resoconto — layout definitivo (rivisto con Gabriele su anteprime)
- **Vista contabile**: SOLO proprieta. Nessuna riga/colonna intragruppo o conto lavoro. Dettaglio per tipologia = solo merce di proprieta.
- **Vista fisica** (ora **default** del pannello resoconto, `rVista` init `"phys"`): riquadro a scomposizione `Campagna | Proprieta | +Intragruppo | +Conto lavoro | =Fisico`; **colonne +Intragruppo/+Conto lavoro nascoste se il totale e' 0**. Dettaglio per tipologia con colonna **"di cui intr."** (nascosta se 0). Invariante verificata: Proprieta + Intragruppo + Conto lavoro = Fisico.
- **Tabella "Magazzino (fisico alla data)"**: usa `occD` = SEMPRE fisico (somma tutti i lotti con disp>0 prima del filtro vista), quindi include gia' intragruppo e conto lavoro. NON e' un bug se mostra pochi magazzini: rispecchia i dati (vedi 21.4).
- **Export Excel — colonna Partner** aggiunta nel foglio "Dettaglio giacenze" (resoconto, via `pMapR` in DashboardPage) e nell'export rapido Giacenze (`XC.giacenze` legge `r._pnome`, iniettato in GiacenzePage dal `pMap`).

### 21.2 Dashboard
- **Interruttore Fisica/Proprieta** (default **Fisica**). In vista **Proprieta** le KPI "Venduto Intragruppo" e "Conto Lavoro" **sono nascoste** (gate `dashView==="phys"&&tot>0`); compaiono solo in Fisica come scomposizione. Card Giacenza con label e sottotitolo dinamici.
- **BUG storico risolto**: lo stile dei bottoni toggle era stato scritto come funzione `style={(a)=>({...})("phys")}` -> React error #62 (schermata login che lampeggia e poi nero). Fix: oggetto stile diretto `style={{...dashView==="phys"?...}}`. **Regola: `style` deve essere un oggetto, mai una funzione.**

### 21.3 Contratti — quantita gia evasa in creazione
Il campo "Qta Evasa" era mostrato solo in modifica (`{eId&&...}`). Ora **"Qta gia evasa" e' visibile anche in creazione**, per caricare contratti gia' parzialmente evasi. Validazione: evasa non puo' superare il totale. Resta il punto di partenza; le uscite successive incrementano via `incrementa_evasa`.

### 21.4 CORREZIONE INTRAGRUPPO — metodologia (IMPORTANTE, non ripetere l'errore)
Il primo set intragruppo (133 big bag) era **sbagliato per difetto**. Lezioni:
- **Metodo giusto = marcatori DIRETTI** nel file bilancio 31/07 (colonna cliente `col7` + qualificatore `col8`), NON la differenza 28->31. I venduti intragruppo **restano nel file** con disponibilita' azzerata e un marcatore; NON spariscono.
- **Marcatori di vendita/fattura** (esclusi i "PER ASSOBIO"): `Vend assobio`, `fattura assobio`, `fat.assobio` (-> partner ASSOBIO); `FINELLI` + col8 `FATTURATE` (-> FINELLI); `BIOSIC` + col8 `FATTURATE` (-> BIOSIC, foglio BIOLOGICO). **Esclusi** i 13 `biosic` di FAIR FOR LIFE (senza "FATTURATE": sono riferimenti a contratto, non vendite).
- **Chiave di aggancio corretta = lotto + numero big bag + CALIBRO (`desc3`)**. Senza il calibro, righe dello stesso big bag con calibri diversi (es. 11/13 e 13/15) collassano: era la causa di tutti gli scarti (~29.000 kg, 240-vs-194, ecc.).
- **Risultato corretto: ~225 righe / ~222.496 kg** (ripartizione ASSOBIO 216 / FINELLI 6 / BIOSIC 4). Kg presi dal file fisico 19/08 (nel bilancio 31/07 sono azzerati). Resta ~1 riga/~400 kg di scarto residuo (un doppione nel 19/08), irrilevante.
- File prodotti: `intragruppo_azzera.sql` (toglie tutti i flag intragruppo), `intragruppo_correggi_2025.sql` (azzera + marca i 225 con partner, aggancio per chiave-con-calibro via `regexp_replace`), `intragruppo_CORRETTO_bigbag.xlsx` (lista di controllo).

### 21.5 Stato dati reale (appurato via query Supabase)
- Campagna **2025**: merce fisica solo in **Fabbrica** (~269.882 kg, di cui 142.000 intragruppo) e **Vignanello** (~155.554 kg, di cui 80.496 intragruppo). Caprarola/Soriano/ABC Service **vuoti** per il 2025 — corretto, non un bug.
- Campagna **2024**: ~28.380 kg proprieta (in altri magazzini), invariata.
- Totale fisico ~453.816 kg (2025+2024).
- Query utile per spacchettare i totali quando "non tornano":
  `SELECT magazzino,count(*),round(sum(q_iniz-mov)) kg,round(sum(CASE WHEN intragruppo THEN q_iniz-mov ELSE 0 END)) ig FROM lotti GROUP BY magazzino;`

### 21.6 SQL di sessioni recenti (eseguire su Supabase PRIMA del push)
`partner.sql` (tabella partner + lotti.partner_id), `nota_mov.sql` (movimenti.nota). Gia' eseguiti da Gabriele. Le correzioni intragruppo (`intragruppo_correggi_2025.sql`) sono operazioni-dati, non legate al push del codice.


---

## 22. DDT GENERATO DALL'APP + REGISTRO DDT

**Perche'**: per ABC il vostro DDT di andata e' di fatto il "lotto" (ABC risale solo fino al numero DDT e dichiara il calo per DDT esaurito, es. documento di scarico 245 "calo peso da lavorazione esaurimento DDT 09/F"). Un DDT con una riga per lotto/big bag/annata e' quindi tutta la tracciabilita' disponibile verso ABC. Prima i DDT si facevano su Excel con descrizioni generiche ("nocciole e granella tostate vari formati").

**Numerazione**: resta quella del **gestionale** (l'operatore digita il numero). La serie la decide l'app dal magazzino di partenza (`MAG_INFO`): Caprarola `n/anno`, Soriano `n/S/anno`, Fabbrica `n/F/anno`, Vignanello `n/M/anno`. Numero, serie e anno sono campi separati → "09/F" e "9/F" sono lo stesso DDT. Indice unico `(serie, anno, numero)` → doppione bloccato ("risulta gia' emesso nell'app"). L'app mostra l'"ultimo in app" come promemoria, ma la fonte resta il gestionale. **Da ABC Service l'app non genera DDT** (lo emette ABC: si digita il loro numero).

**Dove**: Giacenze → **Trasferisci…** e **Uscita…**. Spunta "Genera DDT dall'app" (default attiva; disattivabile per digitare un DDT gia' fatto). Condizioni: lotti di **un solo magazzino** di partenza (il DDT ha un solo luogo di partenza), partenza diversa da ABC. Precompilati: causale (→ABC `C/LAVORAZIONE`, tra sedi `TRASFERIMENTO TRA SEDI`, uscita `VENDITA`), destinatario (ABC / Assofrutti / acquirente del lotto), luogo destinazione (Idem / magazzino interno). Campi trasporto: a cura di, aspetto, colli (default n. righe), peso lordo, porto, vettore, inizio trasporto (default data), annotazioni, n./data fattura (solo uscita).
- **Data scelta** (non piu' "oggi") per uscite e trasferimenti da Giacenze: e' la data del DDT e dei movimenti. Scanner invariato (oggi + DDT digitato).
- Avvisi: verso ABC con certificazioni miste o naturali+semilavorati (il calo ABC mescolerebbe lavorazioni); **certificato bio scaduto blocca la generazione** (aggiornare `CERT_BIO`).
- Sequenza: insert `ddt` (riserva il numero) → movimenti con `ddt` (stringa formattata) e `ddt_id` → se alcune righe falliscono il DDT viene ridotto alle righe riuscite; se falliscono tutte viene cancellato → PDF scaricato.

**PDF** (`genDDT(row)`, jsPDF+autoTable): layout minimale con tutte le voci dell'Excel (intestazione da volantino punti di ritiro, destinatario, luogo destinazione, luogo partenza con indirizzo stabilimento, causale, trasporto a cura, righe per lotto con certificazione/lotto/imballo/annata/kg, totale peso netto, "Merce di origine italiana", dicitura Bioagricert su righe BIOLOGICHE/FAIR FOR LIFE/BIOSUISSE marcate `*`, aspetto/colli/pesi/porto/vettore/inizio/data ritiro, fattura, annotazioni, 3 firme, dicitura art. 62). Multipagina con intestazione "segue"; piede sull'ultima pagina. Filigrana **ANNULLATO** sulle ristampe di DDT annullati.
- Costanti: `AZ_DDT`, `MAG_INFO` (serie+indirizzi; Vignanello = c/o Produttori Nocciole Monti Cimini, Strada Vasanellese 16, CAP 01039 da verificare), `DEST_ABC`, `DEST_AF`, `BIO_TIPI`, `CERT_BIO` (testo + validita' 03/02/2025–03/02/2028), `CAUS_DDT`.

**Registro DDT** (pagina `DdtPage`, voce menu per tutti): filtri anno/partenza/stato/testo, ristampa PDF dalla fotografia `righe` salvata.

**Annulla (Storico Movimenti)**: annullando una riga con `ddt_id`, se non restano altri movimenti collegati il DDT passa a `stato='annullato'` (resta in archivio, numero non riutilizzabile); altrimenti resta emesso e il messaggio lo segnala.

**SQL**: `ddt_registro.sql` (tabella `ddt`, indice unico, `movimenti.ddt_id`, RLS) — **eseguire PRIMA del push**.

**Fix minore**: messaggio Scanner sui lotti ABC ora rimanda a "Giacenze o Trasformazione" (Movimenti non esiste piu').

**Prossimi passi discussi (non implementati)**: quadratura fatture ABC; DDT anche dallo Scanner. (La registrazione Lavorazioni ABC e' stata fatta: vedi §23.)


---

## 23. LAVORAZIONI ABC (partite per DDT di andata) — sostituisce Trasformazione e Controllo semilavorati

**Modello**: si ragiona come ABC, per **partita** = DDT di andata generato dall'app verso ABC (`ddt.mag_dest='ABC Service'`). ABC non dichiara mai i kg di input per prodotto: dichiara i kg prodotti per DDT di origine e, a fine partita, il calo ("calo peso da lavorazione esaurimento DDT"). Quadratura: **inviato = prodotto + calo (+ differenza di chiusura) + altri movimenti + residuo presso ABC**. Resa per partita = prodotto / (prodotto + calo + differenza).

**Menu**: "Trasformazione" e "Controllo semi." sostituiti da **Lavorazioni ABC** (le vecchie pagine restano nel codice, non nel menu; la card "Rese di trasformazione" della Dashboard e' stata rimossa). Schede:
- **Partite**: una riga per DDT di andata con inviato / prodotto / calo / differenza / altri / residuo / resa / stato (aperta, chiusa, esaurita); dettaglio con lotti (inviati e residuo) e prodotti (kg da questa partita). Avviso per lotti presso ABC senza DDT di andata (situazione storica da importare con l'elenco di ABC).
- **Registra rientro** (un DDT ABC = un documento `doc_abc` tipo DDT): testata n./data DDT ABC; per ogni prodotto tipo, prodotto (TRASF), calibro (`CAL_SEMI`: 9/11, 11/13, 13/15, 2/4, 2/6, UNICO, anche libero), formato in `imballo` (`FORMATI_ABC` o libero), lotto ABC, scadenza, cliente (→ `acquirente`), destinazione (**default resta presso ABC**; rientro in un magazzino → TRASFERIMENTO; consegna diretta → USCITA), kg e **origini** (una o piu' partite con kg, come DDT 288: 100 kg da 09/F + 60 da 40/F). Ripartizione **proporzionale** sui lotti della partita presso ABC con la **stessa certificazione** (filtro opzionale per lavorazione/calibro dell'origine); qualita' figlio = media pesata (RT escluso); annata prevalente con avviso se mista; `sett_prod` = settimana ISO della data.
- **Registra scarico calo** (`doc_abc` tipo SCARICO): partita + kg dichiarati da ABC, ripartiti in proporzione sul residuo. Bloccato se supera il residuo ("mancano rientri da registrare?"). Se resta residuo la partita rimane aperta; **Chiudi con differenza** (tipo CHIUSURA) solo con nota obbligatoria.
- **Documenti ABC**: elenco documenti e **annulla documento** (RPC `abc_annulla`: ripristina i kg sui lotti di origine, elimina prodotti e movimenti; bloccato se un prodotto ha movimenti successivi).

**Movimenti generati**: rientro → ENTRATA del prodotto + TRASFORMAZIONE per ogni lotto di origine (`contratto_id="TRASF:"+figlio`, compatibile con tracciabilita' esistente) + eventuale TRASFERIMENTO/USCITA; `ddt="ABC <n>/<anno>"`, `doc_id`. Scarico → movimenti **CALO** (`contratto_id` "CALO:"/"DIFF:"+doc). `trasformazione_input.ddt_id` = partita di provenienza.

**Regole collegate**:
- Invii ad ABC da Giacenze: **DDT generato dall'app obbligatorio** (spunta bloccata). Scanner: trasferimenti verso ABC bloccati (si fanno da Giacenze).
- Storico Movimenti: i movimenti con `doc_id` si annullano solo da Lavorazioni ABC › Documenti ABC; annullare un trasferimento e' bloccato se il lotto ha movimenti successivi. Filtro "Calo ABC".
- Info lotto in Giacenze: scadenza e cliente. Tracciabilita': "Rientro: DDT ABC n del …" + scadenza.

**DB** (`lavorazioni_abc.sql`, **eseguire PRIMA del push**, richiede `ddt_registro.sql`): `ddt.mag_dest` (+ backfill dai movimenti), tabella `doc_abc` (tipo DDT/SCARICO/CHIUSURA, numero, anno, data, ddt_id, note; unico su tipo+anno+numero), `lotti.scadenza`, `lotti.doc_id`, `movimenti.doc_id`, `trasformazione_input.ddt_id`; RPC atomiche `abc_rientro(p jsonb)`, `abc_scarico(p jsonb)`, `abc_annulla(p_doc bigint)` (security definer). Testate su PostgreSQL 16 locale (rientro con due prodotti e consegna diretta, doppione bloccato, disponibilita' insufficiente con rollback, scarico, chiusura con differenza, annullamenti).

**Decisioni di dominio fissate**: destinazione default "resta presso ABC" (flusso reale BIOSIC/"403" da integrare); ripartizione proporzionale; DDT app obbligatorio per ABC; formato nel campo imballo; granella 2/4 e 2/6 (o su richiesta cliente); chiusura con differenza solo esplicita con nota.

**In sospeso**: situazione di partenza (DDT aperti presso ABC con kg residui + prodotti finiti gia' presso ABC, es. granella A26070G08) — Gabriele la chiede ad ABC, poi si importa. Kg del DDT 09/F da verificare (dai documenti visti: 720 kg prodotti + 88 kg calo = 808 kg). Quadratura fatture ABC.


---

## 24. FIX POST-RILASCIO + USCITA CON CONTRATTO + STAMPA TRACCIABILITA

**Bug 1 — caratteri `\u00b7`, `\u2192`, `\u00e0` visibili a schermo.** Causa: sequenze di escape scritte nel **testo JSX** o in **attributi JSX tra virgolette** (es. `title="Qualita\u0300"`), dove JSX NON interpreta gli escape (li interpreta solo dentro `{"..."}` o nelle stringhe JS). Sostituite con i caratteri veri (NFC). Coinvolte Lavorazioni ABC, pannello DDT e il titolo "Qualità" dei filtri Giacenze (bug preesistente). **Regola nuova**: nel JSX usare il carattere reale o `{"\u00b7"}`, mai `\u00b7` nudo. Controllo automatico con parser Babel (cerca `\uXXXX` in JSXText/JSXAttribute) prima della consegna.

**Bug 2 — scarico calo: `movimenti_tipo_check`.** Il DB aveva un vincolo CHECK sui tipi di movimento che non includeva `CALO`. La RPC e' atomica: nessun dato parziale, basta rifare lo scarico dopo il fix. `fix_movimenti_tipo.sql` ricrea il vincolo con tutti i tipi dell'app (ENTRATA, USCITA, TRASFERIMENTO, TRASFORMAZIONE, INTRAGRUPPO, RIENTRO, RESO, CALO) **piu' quelli gia' presenti nei dati**; stampa anche gli altri vincoli CHECK su lotti/movimenti (da verificare se bloccano calibri nuovi). **Lezione**: prima di introdurre un nuovo `tipo` controllare i vincoli del DB (`select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.movimenti'::regclass`).

**Uscita con contratto/acquirente (Giacenze › Uscita…)**: sezione "Contratto / acquirente" per i **lotti liberi** della selezione (tendina contratti aperti con tipo/lav/cal e residuo, oppure acquirente libero). Alla conferma i lotti liberi vengono assegnati (update `lotti.contratto/acquirente`), il movimento USCITA porta il `contratto_id` effettivo e `incrementa_evasa` scatta sul contratto giusto. I lotti gia' assegnati mantengono il loro contratto. Avvisi (non bloccanti): lotti non corrispondenti a tipo/lav/cal del contratto, kg oltre il residuo. Il destinatario del DDT segue il cliente scelto (se non modificato a mano). Rimosso l'helper `fc2`.

**Stampa tracciabilita'** (`stampaTracciabilita(lot)`, bottone `TracBtn`): PDF A4 con scheda lotto (tipo, lav, cal, magazzino, kg, annata, lavorazione, contratto/cliente, scadenza, merce, rientro ABC, qualita'), **Origine a ritroso** multilivello (trasformazione_input + `lotto_padre` per split, fino a 8 livelli, con kg usati, DDT andata / rientro ABC, M.O./C.O.), **Destinazione in avanti** (prodotti derivati e split, kg da origine, disponibilita', documento ABC), **Uscite** del lotto e dei derivati (data, kg, DDT, cliente, nota), **Movimenti del lotto**. Bottone "Tracciabilità" in: Giacenze (con 1 lotto selezionato, e nel pannello info), Storico Movimenti (pannello lotto), Scanner (scheda big bag).

**SQL**: `fix_movimenti_tipo.sql` (solo DB, idempotente; nessuna dipendenza dal push).


---

## 25. SCALA CERTIFICAZIONI + PANNELLO LATERALE USCITA/TRASFERIMENTO

**Scala di compatibilita' (rientri ABC)** — `CERT_OK` / `certOkP` in App.jsx, `cert_ok()` in DB:
| Prodotto | Origini ammesse |
|---|---|
| CONVENZIONALI | tutte (da bio e superiori = declassamento) |
| BIOLOGICHE | Biologiche, Fair for Life, Biosuisse (dagli ultimi due = declassamento) |
| FAIR FOR LIFE / BIOSUISSE / GIFFONI | solo lo stesso tipo |
- Rientro: la tendina Tipo mostra solo i tipi ammessi dalle partite scelte; il tipo si precompila da una partita mono-tipo. Per default si scarica dai lotti **dello stesso tipo** del prodotto; se la partita ha piu' tipi compatibili compare "Tipo origine" (le voci inferiori sono marcate "declassamento").
- **Declassamento** (origine ≠ prodotto, ammesso dalla scala): riquadro arancione + **motivo obbligatorio**; salvato in `lotti.declassamento` ("Declassamento X → Y: motivo"). Badge **DECLASSATO** in: prodotti della partita, pannello info Giacenze, Tracciabilità, stampa tracciabilità (scheda + tabelle origine/destinazione).
- La RPC `abc_rientro` ricontrolla lato DB la scala e l'obbligo del motivo (testato su PostgreSQL 16: FFL da bio bloccato, bio da conv bloccato, conv da bio senza motivo bloccato, con motivo ok).
- **DDT verso ABC con certificazioni diverse**: blocco con **conferma esplicita** (spunta "Confermo l'invio con certificazioni diverse", `dd.mixOk`), controllato anche in `doBulkTransfer`. Naturali+semilavorati insieme = solo avviso.

**Pannello laterale (Giacenze › Uscita… / Trasferisci…)** — `renderAz()` in GiacenzePage, sostituisce i pannelli in linea e `DdtForm`/`ddtBlock` (rimossi):
- Drawer fisso a destra largo `PANEL_W`=470px (a schermo intero su mobile); la pagina riceve `paddingRight` cosi' la tabella resta visibile e la selezione si puo' modificare (× su ogni lotto per toglierlo).
- Sezioni: **1 Cosa esce / Cosa trasferisci** (lotti compatti, kg modificabili nel trasferimento, riepilogo prodotto e M.O./C.O. pesate) · **2 A chi** (uscita: campo unico con suggerimenti dei contratti aperti; senza contratto il testo = acquirente) / **Dove** (trasferimento: pulsanti magazzino) · **3 Documento** (numero + anteprima serie, data, destinatario, causale e "trasporto a cura del" come pulsanti `Seg`, riga partenza/destinazione con "cambia", **Altri dati di trasporto** chiusi con riepilogo).
- Barra fissa in fondo: totale kg, **Anteprima** (PDF con filigrana ANTEPRIMA, nulla salvato; `genDDT` con `stato:"anteprima"`, `ddtPrep(...,preview)`), **Conferma**.
- **Preferenze per destinatario** in `localStorage` (`ddtPref:<prima riga destinatario>`: aspetto, porto, vettore, a cura) salvate a ogni DDT generato e riproposte quando si sceglie lo stesso destinatario (`ddtWithPref`). Solo sul computer in uso.

**SQL**: `certificazioni.sql` (colonna `lotti.declassamento`, funzione `cert_ok`, RPC `abc_rientro` aggiornata) — **eseguire PRIMA del push**.


---

## 27. ANAGRAFICA CLIENTI (partner esteso) PER DDT E CONTRATTI

**Modello** — un'unica anagrafica: la tabella `partner` (prima solo nome/attivo) ora ha `indirizzo, cap, citta, provincia, piva, cf, note`. Stesse schede per clienti, destinatari DDT e controparti conto lavoro/intragruppo (niente doppioni ASSOBIO/BIOSIC). Nuove tabelle: `partner_luoghi` (luoghi di consegna, piu' di uno per cliente, uno `predefinito`) e `partner_pref` (preferenze di trasporto condivise: aspetto, porto, vettore, a cura del). Collegamenti: `contratti.partner_id`, `ddt.partner_id`. ABC Service e' una scheda dell'anagrafica ("A.B.C. SERVICE SRL", creata/completata dallo script).

**Permessi (RLS)** — tutti gli utenti vedono e **aggiungono** schede e luoghi; **modifica/eliminazione solo admin** (`af_is_admin()` legge `user_profiles.ruolo` per `auth.uid()`); `partner_pref` modificabile da tutti (si aggiorna a ogni DDT). Lo script elimina le vecchie policy permissive su `partner` e crea le nuove. Verifica finale nello script: i profili devono essere collegati ad `auth.users`.

**Normalizzazione nomi** — `af_norm()` (DB) / `normNome()` (app): maiuscolo, punteggiatura via, sigle societarie tolte (SRL, S.R.L., SPA, SNC, SAS, SOC, COOP, SOCIETA, AGRICOLA, SS, SRLS). Usata per doppioni e abbinamenti ("Rossi s.r.l." = "ROSSI SRL").

**Pagina Anagrafica** (voce di menu per tutti, sostituisce "Partner" admin): ricerca, solo attivi, "+ Nuovo cliente" (controllo doppioni), scheda con destinatario come apparira' sul DDT, luoghi di consegna (aggiungi: tutti; modifica/predefinito/elimina: admin), preferenze di trasporto, contratti collegati; Modifica/Disattiva solo admin.

**Pannello uscita/trasferimento (`AzionePanel`, prop `anag`)**:
- "A chi": suggerimenti = contratti compatibili + **clienti dell'anagrafica** (senza contratto → registrato come acquirente con la ragione sociale). Scelto contratto o cliente: destinatario = indirizzo completo (`pAddr`), luogo di consegna predefinito (`lAddr`), preferenze di trasporto dal DB (`partner_pref`, fallback localStorage). "+ Aggiungi «nome» all'anagrafica": mini-scheda (ragione sociale, indirizzo, CAP, citta', prov., P.IVA) salvata e usata subito.
- Lotti gia' assegnati a un solo contratto: destinatario iniziale dalla scheda del cliente del contratto.
- Documento › "cambia": selettore dei luoghi di consegna del cliente (Idem / luoghi / altro).
- Trasferimento verso ABC: destinatario dalla scheda ABC (fallback costante `DEST_ABC`).
- A ogni DDT emesso: `ddt.partner_id` salvato e `partner_pref` aggiornato (upsert).

**Contratti**: campo Cliente con suggerimenti dall'anagrafica; al salvataggio il contratto viene collegato (scheda scelta, oppure abbinata per nome, oppure **creata** se nuova). Badge "non in anagrafica" sui contratti non collegati.

**SQL** (in ordine):
1. `anagrafica.sql` — **PRIMA del push** (colonne, tabelle, permessi, ABC in anagrafica, `af_norm`, `af_is_admin`).
2. `collega_contratti_anteprima.sql` — sola lettura: esito per ogni cliente dei contratti (uguale / DA VERIFICARE / AMBIGUO / NUOVO).
3. `collega_contratti.sql` — crea le schede mancanti e collega i contratti (dopo aver controllato l'anteprima).
Testati su PostgreSQL 16 (idempotenza, abbinamenti, permessi operatore/admin).

**Rimandato**: import dell'anagrafica dal gestionale (Excel/CSV).
