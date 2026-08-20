import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

// El SDK de Supabase se carga vía CDN en index.html como <script type="module">
// que expone `window.supabase.createClient`. Lo envolvemos aquí para que el
// resto de la app importe un único cliente ya configurado.
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
