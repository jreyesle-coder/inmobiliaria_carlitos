import Link from "next/link";
import {
  BarChart3,
  Handshake,
  Banknote,
  ReceiptText,
  LandPlot,
  Users,
  Contact,
  Percent,
  LayoutGrid,
  Settings,
  ShieldCheck,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { requerirPerfil, ETIQUETAS_ROL, esGerencia } from "@/lib/auth";

/** Lo que cada rol podrá hacer. Los módulos entran en los sprints siguientes. */
const MODULOS = [
  { nombre: "Endurecimiento y entrega", sprint: 9, acceso: "gerencia" },
] as const;

/** Los accesos del tablero. `soloGerencia` esconde el tile a los demás roles. */
type Acceso = {
  href: string;
  label: string;
  icono: LucideIcon;
  soloGerencia?: boolean;
};

const ACCESOS: Acceso[] = [
  { href: "/reportes", label: "Reportes y tableros", icono: BarChart3 },
  { href: "/ventas", label: "Ventas", icono: Handshake },
  { href: "/pagos", label: "Pagos", icono: Banknote },
  { href: "/recibos", label: "Recibos", icono: ReceiptText },
  { href: "/solares", label: "Inventario de solares", icono: LandPlot },
  { href: "/clientes", label: "Clientes", icono: Users },
  { href: "/vendedores", label: "Vendedores", icono: Contact },
  { href: "/comisiones", label: "Comisiones", icono: Percent },
  { href: "/proyectos", label: "Proyectos y manzanas", icono: LayoutGrid },
  { href: "/configuracion", label: "Configuración", icono: Settings, soloGerencia: true },
  { href: "/usuarios", label: "Usuarios y roles", icono: ShieldCheck, soloGerencia: true },
  { href: "/bitacora", label: "Bitácora de auditoría", icono: ScrollText, soloGerencia: true },
];

export default async function Inicio() {
  const perfil = await requerirPerfil();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {perfil.nombre_completo || perfil.correo}
        </h1>
        <p className="text-muted-foreground text-sm">
          Su rol es <strong>{ETIQUETAS_ROL[perfil.rol]}</strong>. Sprint 8
          listo: reportes y tableros por rol, con exportación a Excel.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACCESOS.filter((a) => !a.soloGerencia || esGerencia(perfil)).map(
          (a) => {
            const Icono = a.icono;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="group border-accent bg-accent text-accent-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
              >
                <span className="bg-primary/10 text-primary group-hover:bg-primary-foreground/15 group-hover:text-primary-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors">
                  <Icono className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium">{a.label}</span>
              </Link>
            );
          },
        )}
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3 text-sm font-medium">
          Módulos por construir
        </div>
        <ul className="divide-y">
          {MODULOS.map((m) => (
            <li
              key={m.nombre}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium">{m.nombre}</div>
                <div className="text-muted-foreground truncate">
                  Acceso: {m.acceso}
                </div>
              </div>
              <span className="text-muted-foreground shrink-0 text-xs">
                Sprint {m.sprint}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
