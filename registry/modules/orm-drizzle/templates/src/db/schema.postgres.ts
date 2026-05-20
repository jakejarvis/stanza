import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Stanza-managed: this file is the canonical schema. Auth and other modules
// extend it via additional schema files in src/db/*.ts — drizzle picks them
// up automatically as long as they're re-exported from this file.

export const _stanza = pgTable("_stanza", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
