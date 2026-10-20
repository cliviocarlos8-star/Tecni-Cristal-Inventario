import { createClient } from "@supabase/supabase-js";

// Estos valores son públicos por diseño: Supabase los entrega al navegador.
// Los dejamos como respaldo para que una publicación sin variables de entorno
// no detenga toda la aplicación con una pantalla en blanco.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dusiouqadzktrljutqai.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_b3a2EOmDIVfu1pzNCokcuQ_-u1ZdpMh";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
