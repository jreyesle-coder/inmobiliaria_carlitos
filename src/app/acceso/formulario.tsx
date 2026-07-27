"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { iniciarSesion, type EstadoAcceso } from "./acciones";

const claseCampo =
  "border-input bg-background focus-visible:ring-ring/50 h-10 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]";

function BotonEntrar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary text-primary-foreground h-10 w-full rounded-md text-sm font-medium disabled:opacity-60"
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function FormularioAcceso() {
  const [estado, accion] = useActionState<EstadoAcceso, FormData>(
    iniciarSesion,
    {},
  );

  return (
    <form action={accion} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="correo" className="text-sm font-medium">
          Correo
        </label>
        <input
          id="correo"
          name="correo"
          type="email"
          autoComplete="username"
          required
          className={claseCampo}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contrasena" className="text-sm font-medium">
          Contraseña
        </label>
        <input
          id="contrasena"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          className={claseCampo}
        />
      </div>

      {estado.error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {estado.error}
        </p>
      ) : null}

      <BotonEntrar />
    </form>
  );
}
