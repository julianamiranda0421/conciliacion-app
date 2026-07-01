"use client";

import { useState } from "react";

// Paginación reutilizable: 20 filas por página por defecto. Devuelve la página
// (acotada al rango, por si las filas se reducen al filtrar), el slice a mostrar y
// el setter. El reinicio a la página 1 al cambiar de filtro/pestaña lo hace el
// consumidor en sus handlers (setState en render está vetado por el linter).
export function usePaged<T>(rows: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { page: safePage, setPage, pageRows, totalPages, pageSize, total: rows.length };
}
