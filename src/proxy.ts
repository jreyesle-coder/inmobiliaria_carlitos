import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { leerEntornoSupabase } from "@/lib/supabase/entorno";

/**
 * En Next.js 16 el antiguo `middleware` se llama `proxy` y corre en Node.js.
 *
 * Hace dos cosas: refrescar la sesión de Supabase y mandar al login a quien no
 * la tenga. Es una comprobación optimista de conveniencia; la barrera real de
 * permisos son las políticas RLS en la base de datos.
 */

/** Rutas que se pueden ver sin sesión. */
const RUTAS_PUBLICAS = ["/acceso", "/auth"];

export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });

  // El proxy corre antes que cualquier página: si aquí se lanza una excepción,
  // la app entera responde un 500 sin explicación. Mejor decir qué falta.
  let entorno;
  try {
    entorno = leerEntornoSupabase();
  } catch (error) {
    return new NextResponse(
      `No se puede iniciar la aplicación.\n\n${(error as Error).message}\n`,
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const supabase = createServerClient(
    entorno.url,
    entorno.anon,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesNuevas) {
          for (const { name, value } of cookiesNuevas) {
            request.cookies.set(name, value);
          }
          respuesta = NextResponse.next({ request });
          for (const { name, value, options } of cookiesNuevas) {
            respuesta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // No quitar: esta llamada es la que refresca el token expirado.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some(
    (p) => ruta === p || ruta.startsWith(`${p}/`),
  );

  if (!user && !esPublica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/acceso";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
