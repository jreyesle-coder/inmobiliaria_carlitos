import type { Metadata } from "next";
import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { leerConfiguracion, CLAVES_EDITABLES } from "@/lib/configuracion";
import { Decimal } from "@/lib/moneda";
import { FormularioClave, type CampoConfig } from "./formularios";

export const metadata: Metadata = { title: "Configuración — ERP Solares" };

const DEFINICION: Record<
  string,
  { etiqueta: string; ayuda: string; tipo: "porcentaje" | "entero" }
> = {
  comision_porcentaje: {
    etiqueta: "Comisión del vendedor",
    ayuda: "Porcentaje sobre el precio pactado. Aplica a las comisiones que se generen de aquí en adelante; las ya generadas no cambian.",
    tipo: "porcentaje",
  },
  separacion_porcentaje: {
    etiqueta: "Separación (apartado)",
    ayuda: "Porcentaje del valor del solar que se sugiere al registrar una venta nueva.",
    tipo: "porcentaje",
  },
  cuotas_inicial_por_defecto: {
    etiqueta: "Cuotas de la inicial",
    ayuda: "En cuántas cuotas se divide la inicial por defecto al armar un plan.",
    tipo: "entero",
  },
  cuotas_capital_por_defecto: {
    etiqueta: "Cuotas del capital",
    ayuda: "Cuotas que se sugieren para el capital al registrar una venta nueva.",
    tipo: "entero",
  },
};

export default async function Configuracion() {
  await requerirRol("gerencia");

  const valores = await leerConfiguracion([...CLAVES_EDITABLES]);

  const campos: CampoConfig[] = CLAVES_EDITABLES.map((clave) => {
    const def = DEFINICION[clave];
    const valor = valores[clave] ?? "";
    const valorMostrado =
      def.tipo === "porcentaje"
        ? new Decimal(valor || "0").times(100).toString()
        : valor;
    return { clave, valorMostrado, ...def };
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          Cifras de negocio que se ajustan sin tocar el código.{" "}
          <Link href="/comisiones" className="underline underline-offset-4">
            Ir a comisiones
          </Link>
        </p>
      </div>

      <div className="rounded-lg border">
        {campos.map((c) => (
          <FormularioClave key={c.clave} campo={c} />
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        Cambiar un porcentaje o un número de cuotas afecta lo que se calcule de
        aquí en adelante (comisiones nuevas y planes de venta nuevos). No
        recalcula ventas ni comisiones ya registradas.
      </p>
    </div>
  );
}
