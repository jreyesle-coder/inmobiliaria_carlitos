import Link from "next/link";
import { requerirPerfil, ETIQUETAS_ROL, esGerencia } from "@/lib/auth";

/** Lo que cada rol podrá hacer. Los módulos entran en los sprints siguientes. */
const MODULOS = [
  { nombre: "Inventario de solares", sprint: 2, acceso: "todos los roles" },
  { nombre: "Clientes y vendedores", sprint: 3, acceso: "todos los roles" },
  { nombre: "Ventas y plan de pagos", sprint: 4, acceso: "administración y gerencia" },
  { nombre: "Pagos y recibos", sprint: 5, acceso: "administración y gerencia" },
  { nombre: "Comisiones", sprint: 6, acceso: "gerencia" },
  { nombre: "Reportes", sprint: 8, acceso: "según el rol" },
] as const;

export default async function Inicio() {
  const perfil = await requerirPerfil();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {perfil.nombre_completo || perfil.correo}
        </h1>
        <p className="text-muted-foreground text-sm">
          Su rol es <strong>{ETIQUETAS_ROL[perfil.rol]}</strong>. Sprint 1
          listo: acceso, roles, seguridad por fila y bitácora de auditoría.
        </p>
      </div>

      {esGerencia(perfil) ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/usuarios"
            className="hover:bg-muted rounded-md border px-3 py-2"
          >
            Usuarios y roles
          </Link>
          <Link
            href="/bitacora"
            className="hover:bg-muted rounded-md border px-3 py-2"
          >
            Bitácora de auditoría
          </Link>
        </div>
      ) : null}

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
