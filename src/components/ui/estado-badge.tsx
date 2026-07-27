import { ESTADOS, type EstadoSolar } from "@/lib/estados";
import { cn } from "@/lib/utils";

// Chip de estado reutilizable. Mismo color en todo el sistema.
// Uso: <EstadoBadge estado="inicial" />
export function EstadoBadge({
  estado,
  className,
}: {
  estado: EstadoSolar;
  className?: string;
}) {
  const e = ESTADOS[estado];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        e.className,
        className
      )}
    >
      {e.label}
    </span>
  );
}
