import { crearClienteServidor } from "@/lib/supabase/server";
import { formatearMoneda } from "@/lib/moneda";

/** Comprueba contra Supabase que la conexión y las llaves funcionan. */
async function verificarSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { ok: false, detalle: "Falta NEXT_PUBLIC_SUPABASE_URL" };
  }
  try {
    const supabase = await crearClienteServidor();
    const { error } = await supabase.auth.getUser();
    // Sin sesión iniciada, Supabase responde "Auth session missing!": eso
    // igual prueba que el proyecto responde y la llave anónima es válida.
    if (error && !/session/i.test(error.message)) {
      return { ok: false, detalle: error.message };
    }
    return { ok: true, detalle: "Proyecto alcanzable y llave anónima válida" };
  } catch (e) {
    return {
      ok: false,
      detalle: e instanceof Error ? e.message : "Error desconocido",
    };
  }
}

export default async function Inicio() {
  const supabase = await verificarSupabase();
  const baseDatos = process.env.DATABASE_URL
    ? { ok: true, detalle: "DATABASE_URL configurada" }
    : { ok: false, detalle: "Falta DATABASE_URL (migraciones de Drizzle)" };

  const chequeos = [
    { nombre: "Supabase", ...supabase },
    { nombre: "Base de datos (Drizzle)", ...baseDatos },
    {
      nombre: "Formato de moneda",
      ok: formatearMoneda("1500") === "RD$ 1,500.00",
      detalle: `${formatearMoneda("1500")} · ${formatearMoneda("1234567.891")}`,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sistema en construcción
        </h1>
        <p className="text-muted-foreground text-sm">
          Sprint 0: fundaciones y despliegue. Los módulos de inventario,
          clientes, ventas, pagos y recibos entran en los sprints siguientes.
        </p>
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3 text-sm font-medium">
          Estado del entorno
        </div>
        <ul className="divide-y">
          {chequeos.map((c) => (
            <li
              key={c.nombre}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="font-medium">{c.nombre}</div>
                <div className="text-muted-foreground truncate">{c.detalle}</div>
              </div>
              <span
                className={
                  c.ok
                    ? "shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                }
              >
                {c.ok ? "Listo" : "Pendiente"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
