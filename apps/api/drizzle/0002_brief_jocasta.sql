ALTER TABLE "event" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_version_positive" CHECK ("event"."version" > 0);