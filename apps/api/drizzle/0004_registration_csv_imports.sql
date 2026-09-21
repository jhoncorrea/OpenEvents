CREATE TABLE "registration_csv_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_csv_import_scope_key_unique" UNIQUE("event_id","requested_by","idempotency_key"),
	CONSTRAINT "registration_csv_import_hash_check" CHECK ("registration_csv_import"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "registration_csv_import_result_check" CHECK (jsonb_typeof("registration_csv_import"."result") = 'object')
);
--> statement-breakpoint
ALTER TABLE "registration_csv_import" ADD CONSTRAINT "registration_csv_import_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_csv_import" ADD CONSTRAINT "registration_csv_import_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;