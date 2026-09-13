import { createClient } from '@supabase/supabase-js'

// La sessione vive solo nella scheda del browser: chiudendo il browser (o la scheda)
// l'accesso decade e al rientro viene chiesta di nuovo la password.
// Ricaricare la pagina o navigare nell'app NON disconnette.
// sessionStorage non esiste in fase di build (SSR/prerender): in quel caso si usa
// una memoria finta, cosi' l'app non si rompe.
const memoria = { s: {}, getItem: k => (k in memoria.s ? memoria.s[k] : null), setItem: (k, v) => { memoria.s[k] = String(v) }, removeItem: k => { delete memoria.s[k] } }
const storage = typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : memoria

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'magazzino-assofrutti-auth'
    }
  }
)
