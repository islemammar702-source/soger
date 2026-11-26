ALTER TABLE "media_files" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "manufacturer_ref" text;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "purchase_type" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source_file_id" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "extracted_data" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_source_file_id_media_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."media_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_supplier_ref_uq" ON "invoices" USING btree ("supplier_id",lower("external_ref")) WHERE "invoices"."kind" = 'supplier' and "invoices"."status" <> 'cancelled' and "invoices"."external_ref" is not null;