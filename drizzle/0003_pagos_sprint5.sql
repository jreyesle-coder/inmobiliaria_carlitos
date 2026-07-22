ALTER TABLE "pagos" ADD COLUMN "es_reverso" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "pago_reversado_id" uuid;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "motivo_reverso" text;