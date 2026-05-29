// Cliente de Supabase para uso en el servidor (API routes / server actions).
// Usa la service_role key, así que NUNCA debe importarse en componentes cliente.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabase() {
  if (!url || !serviceKey) {
    throw new Error(
      "Faltan variables de entorno SUPABASE. Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
