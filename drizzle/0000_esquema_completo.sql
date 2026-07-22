CREATE TYPE "public"."accion_auditoria" AS ENUM('insert', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."estado_comision" AS ENUM('pendiente', 'pagada');--> statement-breakpoint
CREATE TYPE "public"."estado_contrato" AS ENUM('pendiente', 'listo');--> statement-breakpoint
CREATE TYPE "public"."estado_cuota" AS ENUM('pendiente', 'parcial', 'pagada');--> statement-breakpoint
CREATE TYPE "public"."estado_solar" AS ENUM('libre', 'separado', 'inicial', 'capital', 'saldado', 'area_comercial');--> statement-breakpoint
CREATE TYPE "public"."estado_venta" AS ENUM('separado', 'inicial', 'capital', 'saldado', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('vendedor', 'administracion', 'gerencia');--> statement-breakpoint
CREATE TYPE "public"."tipo_cuota" AS ENUM('separacion', 'inicial', 'capital');--> statement-breakpoint
CREATE TYPE "public"."tipo_interes" AS ENUM('ninguno', 'simple', 'amortizado');--> statement-breakpoint
CREATE TYPE "public"."tipo_recibo" AS ENUM('pago', 'nota_credito');--> statement-breakpoint
CREATE TABLE "bitacora_auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tabla" text NOT NULL,
	"registro_id" text NOT NULL,
	"accion" "accion_auditoria" NOT NULL,
	"usuario_id" uuid,
	"usuario_correo" text,
	"datos_antes" jsonb,
	"datos_despues" jsonb,
	"ocurrido_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre_completo" text NOT NULL,
	"cedula" text,
	"cedula_pendiente" boolean DEFAULT true NOT NULL,
	"telefono" text,
	"correo" text,
	"direccion" text,
	"notas" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comisiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"base_calculo" numeric(14, 2) DEFAULT '0' NOT NULL,
	"porcentaje" numeric(7, 4) DEFAULT '0' NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"estado" "estado_comision" DEFAULT 'pendiente' NOT NULL,
	"fecha_generacion" date NOT NULL,
	"fecha_pago" date,
	"pagada_por" uuid,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" text NOT NULL,
	"valor" text NOT NULL,
	"descripcion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracion_clave_unique" UNIQUE("clave")
);
--> statement-breakpoint
CREATE TABLE "cuotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"tipo" "tipo_cuota" NOT NULL,
	"numero" integer NOT NULL,
	"monto_esperado" numeric(14, 2) NOT NULL,
	"fecha_vencimiento" date NOT NULL,
	"monto_aplicado" numeric(14, 2) DEFAULT '0' NOT NULL,
	"estado" "estado_cuota" DEFAULT 'pendiente' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cuotas_venta_tipo_numero" UNIQUE("venta_id","tipo","numero")
);
--> statement-breakpoint
CREATE TABLE "manzanas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"descripcion" text,
	"valor_m2_referencia" numeric(14, 2),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manzanas_proyecto_codigo" UNIQUE("proyecto_id","codigo")
);
--> statement-breakpoint
CREATE TABLE "pago_aplicaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pago_id" uuid NOT NULL,
	"cuota_id" uuid NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pago_aplicaciones_pago_cuota" UNIQUE("pago_id","cuota_id")
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_id" uuid NOT NULL,
	"fecha_pago" date NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"metodo" "metodo_pago" NOT NULL,
	"referencia" text,
	"notas" text,
	"registrado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perfiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nombre_completo" text DEFAULT '' NOT NULL,
	"correo" text NOT NULL,
	"rol" "rol_usuario" DEFAULT 'vendedor' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proyectos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"ubicacion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proyectos_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "recibos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" bigserial NOT NULL,
	"tipo" "tipo_recibo" DEFAULT 'pago' NOT NULL,
	"pago_id" uuid,
	"venta_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"monto" numeric(14, 2) NOT NULL,
	"concepto" text NOT NULL,
	"recibo_original_id" uuid,
	"numero_referencia_excel" text,
	"ncf" text,
	"secuencia_fiscal" text,
	"ruta_pdf" text,
	"emitido_por" uuid,
	"emitido_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recibos_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "solares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manzana_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"area_m2" numeric(14, 2) NOT NULL,
	"valor_m2" numeric(14, 2) NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"estado" "estado_solar" DEFAULT 'libre' NOT NULL,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solares_manzana_numero" UNIQUE("manzana_id","numero")
);
--> statement-breakpoint
CREATE TABLE "vendedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre_completo" text NOT NULL,
	"cedula" text,
	"telefono" text,
	"correo" text,
	"perfil_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendedores_perfil_id_unique" UNIQUE("perfil_id")
);
--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solar_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"vendedor_id" uuid,
	"fecha_venta" date NOT NULL,
	"precio_pactado" numeric(14, 2) NOT NULL,
	"monto_separacion" numeric(14, 2) DEFAULT '0' NOT NULL,
	"monto_inicial" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cuotas_inicial" integer DEFAULT 12 NOT NULL,
	"estado" "estado_venta" DEFAULT 'separado' NOT NULL,
	"estado_contrato" "estado_contrato" DEFAULT 'pendiente' NOT NULL,
	"notas" text,
	"tipo_interes" "tipo_interes" DEFAULT 'ninguno' NOT NULL,
	"tasa_interes_anual" numeric(7, 4) DEFAULT '0' NOT NULL,
	"aplica_mora" boolean DEFAULT false NOT NULL,
	"tasa_mora_mensual" numeric(7, 4) DEFAULT '0' NOT NULL,
	"meses_amortizacion" integer,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_creado_por_perfiles_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_vendedor_id_vendedores_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comisiones" ADD CONSTRAINT "comisiones_pagada_por_perfiles_id_fk" FOREIGN KEY ("pagada_por") REFERENCES "public"."perfiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuotas" ADD CONSTRAINT "cuotas_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manzanas" ADD CONSTRAINT "manzanas_proyecto_id_proyectos_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyectos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_aplicaciones" ADD CONSTRAINT "pago_aplicaciones_pago_id_pagos_id_fk" FOREIGN KEY ("pago_id") REFERENCES "public"."pagos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pago_aplicaciones" ADD CONSTRAINT "pago_aplicaciones_cuota_id_cuotas_id_fk" FOREIGN KEY ("cuota_id") REFERENCES "public"."cuotas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registrado_por_perfiles_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."perfiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_pago_id_pagos_id_fk" FOREIGN KEY ("pago_id") REFERENCES "public"."pagos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_emitido_por_perfiles_id_fk" FOREIGN KEY ("emitido_por") REFERENCES "public"."perfiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solares" ADD CONSTRAINT "solares_manzana_id_manzanas_id_fk" FOREIGN KEY ("manzana_id") REFERENCES "public"."manzanas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_perfil_id_perfiles_id_fk" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_solar_id_solares_id_fk" FOREIGN KEY ("solar_id") REFERENCES "public"."solares"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_vendedor_id_vendedores_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."vendedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_creado_por_perfiles_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bitacora_tabla_registro_idx" ON "bitacora_auditoria" USING btree ("tabla","registro_id");--> statement-breakpoint
CREATE INDEX "bitacora_ocurrido_idx" ON "bitacora_auditoria" USING btree ("ocurrido_en");--> statement-breakpoint
CREATE INDEX "comisiones_vendedor_idx" ON "comisiones" USING btree ("vendedor_id");--> statement-breakpoint
CREATE INDEX "pagos_venta_idx" ON "pagos" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "solares_estado_idx" ON "solares" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "ventas_solar_idx" ON "ventas" USING btree ("solar_id");--> statement-breakpoint
CREATE INDEX "ventas_cliente_idx" ON "ventas" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ventas_vendedor_idx" ON "ventas" USING btree ("vendedor_id");