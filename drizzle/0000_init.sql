CREATE TABLE "channel_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_provider_message_id_uq" UNIQUE("provider_message_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "channel_links_channel_external_id_uq" ON "channel_links" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "channel_links_clerk_user_id_idx" ON "channel_links" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("channel","external_id","created_at");