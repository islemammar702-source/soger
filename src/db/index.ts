import "server-only";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as NeonPool } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant (voir .env.example)");

/**
 * Neon en production (driver WebSocket : supporte les transactions),
 * PostgreSQL classique en local. Même schéma, même code.
 */
const isNeon = /\.neon\.tech/.test(url);

function create() {
  return isNeon
    ? drizzleNeon({ client: new NeonPool({ connectionString: url }), schema })
    : drizzlePg({ client: new PgPool({ connectionString: url, max: 10 }), schema });
}

type DB = ReturnType<typeof create>;
const globalForDb = globalThis as unknown as { __sogerDb?: DB };

/** Une seule instance de pool, y compris pendant le rechargement à chaud. */
export const db: DB = globalForDb.__sogerDb ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.__sogerDb = db;

export { schema };
