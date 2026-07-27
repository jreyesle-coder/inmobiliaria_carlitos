// Formato de dinero en convención dominicana: RD$ 1,500.00
// (coma para miles, punto para centavos). Solo para MOSTRAR.
//
// Nota del proyecto (CLAUDE.md, regla dura #1): los montos NUNCA se procesan
// con float. Por eso `formatRD` NO usa `Number()`: delega en `formatearMoneda`,
// que formatea con decimal exacto. La API es la del tema; la matemática es la
// del proyecto.

import { formatearMoneda, type Decimal } from "@/lib/moneda";

export function formatRD(
  valor: number | string | Decimal | null | undefined,
): string {
  if (valor === null || valor === undefined || valor === "") return "RD$ 0.00";
  try {
    // `String(Decimal)` da el string numérico exacto que `formatearMoneda`
    // procesa con decimal, sin pasar por float.
    return formatearMoneda(String(valor));
  } catch {
    return "RD$ 0.00";
  }
}

// Área en metros cuadrados: 240.04 m²
export function formatM2(valor: number | string | null | undefined): string {
  const n = typeof valor === "string" ? Number(valor) : (valor ?? 0);
  if (Number.isNaN(n)) return "0 m²";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " m²";
}
