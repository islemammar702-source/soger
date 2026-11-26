CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "stock_count_items" (
	"count_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"expected" numeric(14, 3) NOT NULL,
	"counted" numeric(14, 3),
	CONSTRAINT "stock_count_items_count_id_product_id_pk" PRIMARY KEY("count_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_counts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"warehouse_id" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"created_by" integer,
	"closed_by" integer,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_counts_status" CHECK ("stock_counts"."status" in ('open', 'closed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_count_id_stock_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");