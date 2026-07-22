import { obtenerPerfil, ETIQUETAS_ROL } from "@/lib/auth";
import { cerrarSesion } from "@/app/acceso/acciones";

/** Identidad y rol del usuario, con salida de sesión. Vacío si no hay sesión. */
export async function BarraUsuario() {
  const perfil = await obtenerPerfil();
  if (!perfil) return null;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground hidden sm:inline">
        {perfil.nombre_completo || perfil.correo}
      </span>
      <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">
        {ETIQUETAS_ROL[perfil.rol]}
      </span>
      <form action={cerrarSesion}>
        <button type="submit" className="text-sm underline underline-offset-4">
          Salir
        </button>
      </form>
    </div>
  );
}
