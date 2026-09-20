-- Completar datos previos antes de exigir unicidad. No fusionar ni borrar asistentes.
ALTER TABLE "registration" ADD COLUMN "email_normalized" text;
--> statement-breakpoint
UPDATE "registration" AS r
SET "email_normalized" = lower(btrim(a.email, E' \t\n\r\f' || chr(11)) COLLATE "C")
FROM "attendee" AS a
WHERE a.id = r.attendee_id;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "registration"
    WHERE email_normalized IS NULL
      OR email_normalized !~ '^[!-~]+@[!-~]+$'
      OR length(email_normalized) > 254
  ) THEN
    RAISE EXCEPTION 'Registration email migration requires review of legacy email data.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "registration"
    GROUP BY event_id, email_normalized HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Registration email migration requires review of duplicate event emails.';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "registration" ALTER COLUMN "email_normalized" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_event_email_unique" UNIQUE("event_id","email_normalized");
--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_email_normalized_check" CHECK ("registration"."email_normalized" = lower("registration"."email_normalized" COLLATE "C") AND "registration"."email_normalized" ~ '^[!-~]+@[!-~]+$' AND length("registration"."email_normalized") <= 254);
