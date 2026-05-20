import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const _stanza = sqliteTable("_stanza", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
