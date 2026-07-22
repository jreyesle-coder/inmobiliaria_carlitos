ALTER TABLE "ventas" ADD COLUMN "cuotas_capital" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "fecha_cancelacion" date;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "motivo_cancelacion" text;