# Guida Deploy — Magazzino Assofrutti v2
## Tutto incluso: login, ruoli, storico, export Excel, stampa

Tempo totale: circa 25 minuti. Costo: zero.
Non serve modificare nessun file di codice.

---

## PASSO 1 — Database Supabase (10 min)

1. Vai su https://supabase.com e crea un account gratuito
2. Clicca **New Project**
3. Nome: `magazzino-assofrutti` — Region: **Central EU (Frankfurt)** — Crea
4. Aspetta 2 minuti che sia pronto

### Crea le tabelle
5. Menu a sinistra: **SQL Editor** > **New Query**
6. Copia/incolla TUTTO il contenuto del file `supabase-schema.sql`
7. Clicca **Run** — deve apparire "Success. No rows returned"

### Disabilita conferma email
8. Menu: **Authentication** > **Providers** > **Email**
9. Disattiva "Confirm email" > **Save**

### Prendi le chiavi
10. Menu: **Settings** > **API**
11. Copia e salva:
    - **Project URL** (es. `https://abc123.supabase.co`)
    - **anon public key** (stringa lunga con `eyJ...`)

### Crea il tuo account admin
12. Menu: **Authentication** > **Users** > **Add User**
13. Inserisci la tua email e una password
14. Torna in **SQL Editor** ed esegui:
```sql
UPDATE user_profiles SET ruolo = 'admin', nome = 'Il Tuo Nome'
WHERE email = 'la-tua-email@esempio.it';
```

---

## PASSO 2 — Prepara il progetto sul PC (3 min)

1. Scompatta `magazzino-assofrutti.zip`
2. Entra nella cartella e crea il file `.env`:
```bash
cd magazzino-assofrutti
cp .env.example .env
```
3. Apri `.env` con un editor di testo e inserisci le chiavi:
```
VITE_SUPABASE_URL=https://il-tuo-progetto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ-la-tua-chiave
```

---

## PASSO 3 — GitHub (3 min)

1. Vai su https://github.com > **+** > **New repository**
2. Nome: `magazzino-assofrutti` > **Create repository**
3. Nel terminale:
```bash
git init
git add .
git commit -m "Magazzino Assofrutti"
git branch -M main
git remote add origin https://github.com/TUO-USERNAME/magazzino-assofrutti.git
git push -u origin main
```

---

## PASSO 4 — Vercel (5 min)

1. Vai su https://vercel.com e accedi con GitHub
2. **Add New** > **Project** > Importa `magazzino-assofrutti`
3. Aggiungi le **Environment Variables**:

| Name                     | Value                        |
|--------------------------|------------------------------|
| VITE_SUPABASE_URL        | Il tuo Project URL           |
| VITE_SUPABASE_ANON_KEY   | La tua anon key              |

4. Clicca **Deploy** — aspetta 2 minuti
5. Ti dà un URL tipo `https://magazzino-assofrutti.vercel.app`

Apri il link > accedi con le credenziali create al Passo 1.

---

## PASSO 5 — Importa i dati dall'Excel (2 min)

```bash
cd magazzino-assofrutti
npm install xlsx dotenv @supabase/supabase-js
```
Copia il file `Magazzino_Nuovo.xlsm` nella cartella, poi:
```bash
node importa-dati.mjs
```
Importa automaticamente 361 lotti, 24 contratti, 473 movimenti.

---

## PASSO 6 — Crea gli account per i colleghi

1. Accedi all'app con il tuo account admin
2. Nel menu c'e la voce **Utenti** (solo admin la vede)
3. Clicca **+ Nuovo Utente** per ogni collega
4. Comunica email e password

---

## Permessi

| Funzione                              | Operatore | Admin |
|---------------------------------------|:---------:|:-----:|
| Dashboard, giacenze, lotti, ricerca   |     SI    |   SI  |
| Inserire movimenti                    |     SI    |   SI  |
| Storico (vista a una data)            |     SI    |   SI  |
| Esportare in Excel                    |     SI    |   SI  |
| Stampare                              |     SI    |   SI  |
| Assegnare lotti a contratti           |     NO    |   SI  |
| Modificare/eliminare lotti            |     NO    |   SI  |
| Creare/modificare/eliminare contratti |     NO    |   SI  |
| Annullare movimenti                   |     NO    |   SI  |
| Gestire utenti                        |     NO    |   SI  |

---

## Costi: ZERO

- Supabase Free: 500MB, auth inclusa
- Vercel Free: 100GB/mese
- Per 4-5 persone non raggiungerete mai i limiti

---

## Problemi comuni

**Errore SQL "trigger already exists"**
Lo schema usa DROP TRIGGER IF EXISTS, quindi puoi eseguirlo
piu volte senza problemi. Se hai gia eseguito una versione
precedente, esegui prima: DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
poi riesegui lo schema.

**"Email o password errati"**
Verifica di aver disattivato "Confirm email" in Supabase.

**Errore connessione nell'app**
Controlla le variabili VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY su Vercel.

**Aggiornare l'app in futuro**
Modifica i file > `git add . && git commit -m "modifica" && git push`
Vercel aggiorna automaticamente in 2 minuti.
