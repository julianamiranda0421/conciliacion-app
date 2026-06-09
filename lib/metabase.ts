// Cliente de Metabase (solo servidor). Llama al card "Payments 360" (cartera 360)
// y devuelve todas las filas (factura ⟕ pago, ya filtrado a 2026 dentro del card).
// La API key NUNCA debe llegar al cliente: solo se usa en API routes / server.

// Limpia el valor: quita BOM (U+FEFF) y espacios/saltos. Vercel a veces guarda
// la variable con un BOM al inicio que rompe fetch al ponerla en un header HTTP
// ("Cannot convert argument to a ByteString ... value of 65279").
const cleanEnv = (v: string | undefined) =>
  v?.replace(/^﻿/, "").trim() || undefined;

const url = cleanEnv(process.env.METABASE_URL);
const apiKey = cleanEnv(process.env.METABASE_API_KEY);
const cardId = cleanEnv(process.env.METABASE_CARD_ID);

export type Bill360Raw = {
  id: number; // bill_id
  period: string | null;
  contract_id: number | null;
  company_id: number | null;
  created_at: string | null;
  expired_date: string | null;
  total: number | null;
  total_with_deposit: number | null;
  bill_status: string | null;
  transaction_id: number | null;
  payment_date: string | null;
  payment_method_type: string | null;
  payment_method_name: string | null;
  collection_type: string | null;
  network_collection: string | null;
  reference_bill: string | null;
  is_partial_payment: boolean | null;
  amount: number | null;
  bia_credits: number | null;
  transaction_state: string | null;
  s3_path_document: string | null;
};

// Corre el card guardado y devuelve TODAS las filas (el endpoint de export no aplica
// el tope de 2000 filas que sí tiene /api/dataset). El card debe traer ya el filtro 2026.
export async function fetchBills360(): Promise<Bill360Raw[]> {
  if (!url || !apiKey || !cardId) {
    throw new Error(
      "Faltan variables de entorno METABASE_URL / METABASE_API_KEY / METABASE_CARD_ID.",
    );
  }
  const res = await fetch(`${url}/api/card/${cardId}/query/json`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Metabase respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    // Metabase devuelve {error: ...} si la query falla.
    const msg =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : "respuesta inesperada (no es una lista de filas)";
    throw new Error(`Metabase: ${msg}`);
  }
  return data as Bill360Raw[];
}
