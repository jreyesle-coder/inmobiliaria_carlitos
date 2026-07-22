/**
 * Roles y perfiles sin dependencias de servidor: este módulo también lo
 * importan componentes de cliente. La lógica que toca Supabase está en
 * `lib/auth.ts`.
 */

export type Rol = "vendedor" | "administracion" | "gerencia";

export type Perfil = {
  id: string;
  nombre_completo: string;
  correo: string;
  rol: Rol;
  activo: boolean;
};

export const ROLES: Rol[] = ["vendedor", "administracion", "gerencia"];

/** Etiquetas para la interfaz. */
export const ETIQUETAS_ROL: Record<Rol, string> = {
  vendedor: "Vendedor",
  administracion: "Administración",
  gerencia: "Gerencia",
};

export const esGerencia = (p: Perfil) => p.rol === "gerencia";
export const esAdminOGerencia = (p: Perfil) =>
  p.rol === "administracion" || p.rol === "gerencia";
