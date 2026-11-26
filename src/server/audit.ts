import "server-only";
import { headers } from "next/headers";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export type Tx = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/** Journal d'activité : qui, quoi, quand, anciennes et nouvelles valeurs. */
export async function audit(
  entry: {
    userId?: number | null;
    module: string;
    action: string;
    entityType?: string;
    entityId?: string | number | null;
    oldValues?: unknown;
    newValues?: unknown;
  },
  tx: Tx = db as unknown as Tx,
) {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    /* hors requête (script) */
  }
  await tx.insert(auditLogs).values({
    userId: entry.userId ?? null,
    module: entry.module,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId == null ? null : String(entry.entityId),
    oldValues: entry.oldValues ?? null,
    newValues: entry.newValues ?? null,
    ip,
    userAgent,
  });
}

/** Ne garde que les champs modifiés, pour un journal lisible. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    const a = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
    const b = v instanceof Date ? v.toISOString() : v;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      oldValues[k] = a;
      newValues[k] = b;
    }
  }
  return { oldValues, newValues, changed: Object.keys(newValues).length > 0 };
}
