// Cliente de Supabase para uso en el servidor (API routes / server actions).
// Usa la service_role key, así que NUNCA debe importarse en componentes cliente.

import { createClient } from "@supabase/supabase-js";

// Quita BOM (U+FEFF) y espacios/saltos. Si la variable en Vercel se guardó con un
// BOM al inicio, la librería revienta al ponerlo en un header HTTP
// ("Cannot convert argument to a ByteString ... value of 65279").
const cleanEnv = (v: string | undefined) =>
  v?.replace(/^﻿/, "").trim() || undefined;

const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

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
