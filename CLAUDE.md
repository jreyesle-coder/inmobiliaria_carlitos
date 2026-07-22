@AGENTS.md

# ERP Inmobiliario (Solares) — Guía del Proyecto

Aplicativo web para la administración y venta de solares del proyecto OASIS DE MACHIN (CARLITOS INMOBILIARIA): proyectos, inventario de solares, clientes, ventas, planes de pago, pagos, recibos, comisiones y reportes. Uso interno, 5–10 personas en tres roles: vendedores, administración y gerencia.

El plan por sprints está en `PLAN.md`. Este archivo son las reglas que mandan sobre cualquier prompt: si algo aquí choca con una instrucción suelta, gana esto.

## Stack

* Next.js (App Router) + TypeScript
* Supabase: Postgres, Auth, Storage y Row Level Security (RLS)
* Drizzle ORM para esquema y migraciones
* TailwindCSS + shadcn/ui
* Despliegue en Vercel (preview + producción)
* PDF de recibos con pdf-lib (o react-pdf), guardados en Supabase Storage

## Reglas duras (NUNCA se violan)

1. **Dinero**: siempre `numeric(14,2)` en la base y decimal exacto en el código. NUNCA usar `float` ni el `number` de punto flotante para montos. Se muestra como `RD$ 1,500.00` (coma para miles, punto para centavos).
2. **Recibos inmutables**: un recibo emitido no se edita ni se borra. Para corregir se emite una nota de crédito / reverso. La tabla de recibos no debe exponer rutas de UPDATE ni DELETE. Numeración limpia y secuencial nueva; los números viejos del Excel se conservan solo como referencia (campo aparte).
3. **Auditoría**: toda operación sobre dinero, recibos, ventas, comisiones y cambios de estado se registra en `bitacora_auditoria` (tabla, registro, acción, usuario, fecha, datos antes/después).
4. **Seguridad por rol**: aplicar RLS en Supabase por rol (vendedor, administracion, gerencia). No confiar solo en la UI para los permisos.
5. **Idioma y moneda**: toda la interfaz, mensajes y etiquetas en español. Moneda por defecto DOP (RD$).
6. **Cuota vs. pago**: la cuota (monto esperado del plan) y el pago (monto real recibido) son entidades separadas. Los pagos se aplican a cuotas a través de una tabla de aplicaciones (permite pagos parciales y sobrepagos).
7. **Cliente = cédula**: la cédula es el identificador único del cliente. La data inicial NO trae cédulas, así que el campo es obligatorio-pendiente: el cliente se crea sin cédula (marcado "pendiente") y se exige/valida al recolectarla. No permitir dos clientes con la misma cédula una vez cargada.

## Reglas de negocio confirmadas

* **Solar**: pertenece a una manzana (B, C, D, E); área en m²; se guarda valor por m² y total valor; estado (ver pipeline); comprador; apartado; inicial; total abonado; balance pendiente.
* **Estado del solar/venta (pipeline único)**: Libre → Separado (apartado) → Inicial → Capital (financiando) → Saldado. "Área Comercial" es estado aparte (no se vende como solar residencial). Normalizar los términos sueltos del Excel (SEPARACION, ABO/CAP, INICIAL/CAPITAL, etc.) a este pipeline.
* **Vendedor y comisión**: cada venta tiene un vendedor asignado y una comisión con estado (pagada/pendiente). Es un módulo del sistema, no solo un rol.
* **Contrato**: cada venta lleva estado de contrato (listo/pendiente).
* **Pago**: lleva método (efectivo o transferencia) y número de recibo.
* **Inicial**: se paga en **6 cuotas** (confirmado por Julio el 22/07/2026, "por el momento"). Vive en `configuracion.cuotas_inicial_por_defecto`, no fijo en código.
* **Separación (apartado)**: **5% del valor del solar** (confirmado por Julio el 22/07/2026, "por el momento"). Vive en `configuracion.separacion_porcentaje`. Es un cálculo sugerido: `ventas.monto_separacion` guarda lo realmente pactado, igual que el `valor_total` del solar.
* **Cédula**: el dígito verificador (Luhn mod 10) **advierte pero no bloquea** — hay cédulas viejas legítimas que no lo pasan. Los 11 dígitos sí son obligatorios.

## Preparado pero desactivado (dejar la estructura lista, no implementar aún)

* **Interés y mora**: dejar los campos (tasa, tipo, amortización) y el punto de cálculo previstos, pero desactivados. Se activan por configuración cuando se confirme el modelo.
* **Comprobantes fiscales DGII/NCF**: dejar la estructura del recibo y su numeración listas para secuencias fiscales, aunque hoy sean de control interno.

## Convenciones

* Tablas y columnas en español, snake_case: `proyectos`, `solares`, `clientes`, `ventas`, `vendedores`, `comisiones`, `cuotas`, `pagos`, `pago_aplicaciones`, `recibos`, `perfiles`, `bitacora_auditoria`.
* Migraciones versionadas con Drizzle; nunca cambiar el esquema a mano en prod.
* Secretos solo en variables de entorno (`.env.local` en local, Secrets en Vercel). NUNCA commitear llaves ni el archivo `.env.local`.
* Commits descriptivos; al cerrar cada sprint, push a GitHub y verificar el preview de Vercel.

## Migración de datos (importante)

La data inicial (Excel OASIS DE MACHIN) está repartida en varias hojas que NO cuadran entre sí. La migración NO decide qué cifra es correcta: registra lo que hay y todo lo dudoso queda listado en `novedades-a-aclarar` para que el cliente lo resuelva. Ver el sprint de reconciliación en `PLAN.md`.

## Cómo trabajar

* Se construye por sprints (ver `PLAN.md`). UN sprint por sesión.
* Al iniciar cada sesión, leer `PLAN.md` para ubicar en qué sprint vamos.
* No avanzar al siguiente sprint hasta que el actual funcione de punta a punta, esté probado, commiteado y desplegando en el preview de Vercel.
* Antes de acciones que requieran datos de Julio (llaves de Supabase, decisiones de negocio abiertas), preguntar; nunca inventar secretos.
