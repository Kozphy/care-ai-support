import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tickets = sqliteTable("tickets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
});
