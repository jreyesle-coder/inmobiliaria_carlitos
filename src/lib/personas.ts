/**
 * Reglas de clientes y vendedores sin dependencias de servidor: las importan
 * tanto las Server Actions como los formularios de cliente.
 *
 * La cédula es el identificador del cliente (ver CLAUDE.md), pero la data
 * inicial no la trae: se guarda `null` y el cliente queda "pendiente". Cuando
 * llega, se normaliza a 11 dígitos sin guiones —así la unicidad es real— y se
 * muestra formateada.
 *
 * Estas mismas reglas están en la base (`supabase/sql/05_personas.sql`): el
 * trigger `tr_normalizar_cliente` limpia la cédula y la restricción
 * `clientes_cedula_formato` exige los 11 dígitos. Aquí son para dar mensajes
 * en español; allá son la barrera real.
 */

/** Deja solo los dígitos: "031-0123456-7" → "03101234567". */
export function normalizarCedula(entrada: string): string {
  return entrada.replace(/\D/g, "");
}

/** Formato de pantalla: "03101234567" → "031-0123456-7". */
export function formatearCedula(cedula: string | null): string {
  if (!cedula) return "";
  const d = normalizarCedula(cedula);
  if (d.length !== 11) return cedula;
  return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
}

/**
 * Dígito verificador de la cédula dominicana: módulo 10 sobre los primeros
 * diez dígitos con pesos alternos 1, 2, 1, 2…
 *
 * No es una validación infalible —hay cédulas viejas en circulación que no lo
 * cumplen—, así que la UI la usa como advertencia y deja guardarla marcando
 * "guardar igual". Lo que sí se exige siempre son los 11 dígitos.
 */
export function digitoVerificadorValido(cedula: string): boolean {
  const d = normalizarCedula(cedula);
  if (d.length !== 11) return false;

  let suma = 0;
  for (let i = 0; i < 10; i++) {
    let producto = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
    if (producto > 9) producto -= 9;
    suma += producto;
  }
  return (10 - (suma % 10)) % 10 === Number(d[10]);
}

export type ResultadoCedula =
  | { estado: "vacia" }
  | { estado: "invalida"; mensaje: string }
  | { estado: "dudosa"; cedula: string; mensaje: string }
  | { estado: "ok"; cedula: string };

/**
 * Lee lo que el usuario escribió en el campo de cédula. Vacío es válido
 * (queda pendiente); once dígitos con dígito verificador malo es "dudosa".
 */
export function revisarCedula(entrada: string): ResultadoCedula {
  const d = normalizarCedula(entrada);
  if (d === "") return { estado: "vacia" };

  if (d.length !== 11) {
    return {
      estado: "invalida",
      mensaje: `La cédula debe tener 11 dígitos (se recibieron ${d.length}).`,
    };
  }

  if (!digitoVerificadorValido(d)) {
    return {
      estado: "dudosa",
      cedula: d,
      mensaje:
        "La cédula no pasa el dígito verificador. Verifíquela; si es correcta, marque «guardar la cédula igual».",
    };
  }

  return { estado: "ok", cedula: d };
}

/** Teléfono: se guarda solo con dígitos y se muestra como (809) 555-1234. */
export function formatearTelefono(telefono: string | null): string {
  if (!telefono) return "";
  const d = telefono.replace(/\D/g, "");
  if (d.length !== 10) return telefono;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Correo mínimamente verosímil. La validación real la hace quien lo escribe. */
export function correoValido(correo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}
