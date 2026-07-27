// Fuente única del color de cada estado del pipeline (solar y venta).
// Las clases usan los tokens definidos en globals.css (bg-estado-*, text-estado-*-foreground).
// Se escriben completas (no concatenadas) para que Tailwind las detecte.
//
// El union cubre TODOS los estados que muestra la app: los del solar
// (incluye `area_comercial`) y los de la venta (incluye `cancelada`), más
// `vencido` para las cuotas atrasadas. Así <EstadoBadge> sirve en cualquier
// pantalla sin importar de qué enum venga el valor.

export type EstadoSolar =
  | "libre"
  | "separado"
  | "inicial"
  | "capital"
  | "saldado"
  | "area_comercial"
  | "cancelada"
  | "vencido";

export const ESTADOS: Record<EstadoSolar, { label: string; className: string }> = {
  libre:          { label: "Libre",          className: "bg-estado-libre text-estado-libre-foreground" },
  separado:       { label: "Separado",       className: "bg-estado-separado text-estado-separado-foreground" },
  inicial:        { label: "Inicial",        className: "bg-estado-inicial text-estado-inicial-foreground" },
  capital:        { label: "Capital",        className: "bg-estado-capital text-estado-capital-foreground" },
  saldado:        { label: "Saldado",        className: "bg-estado-saldado text-estado-saldado-foreground" },
  area_comercial: { label: "Área comercial", className: "bg-estado-comercial text-estado-comercial-foreground" },
  cancelada:      { label: "Cancelada",      className: "bg-estado-vencido text-estado-vencido-foreground" },
  vencido:        { label: "Vencido",        className: "bg-estado-vencido text-estado-vencido-foreground" },
};

// Normaliza los textos sueltos del Excel a un estado limpio del pipeline.
export function normalizarEstado(crudo: string | null | undefined): EstadoSolar {
  const s = (crudo ?? "").trim().toUpperCase();
  if (!s) return "libre";
  if (s.includes("COMERCIAL")) return "area_comercial";
  if (s.includes("CANCELAD")) return "cancelada";
  if (s.includes("SALDAD") || s.includes("COMPLETAD")) return "saldado";
  if (s.includes("CAPITAL") || s.includes("ABO/CAP")) return "capital";
  if (s.includes("INICIAL")) return "inicial";
  if (s.includes("SEPARA")) return "separado"; // SEPARADO / SEPARACION
  if (s === "LIBRE") return "libre";
  return "separado";
}
