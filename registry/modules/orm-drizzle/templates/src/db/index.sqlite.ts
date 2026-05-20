import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

const url = process.env.DATABASE_URL!.replace(/^file:/, "");
const client = new Database(url);
export const db = drizzle(client, { schema });
export type Database = typeof db;
