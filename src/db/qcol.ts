import { getTableName, sql, type Column } from "drizzle-orm";

/**
 * Colonne toujours préfixée par sa table ("table"."colonne").
 * Drizzle écrit les colonnes sans table quand la requête n'a qu'une table ;
 * dans une sous-requête corrélée, « "id" » désignerait alors la table interne.
 */
export const qcol = (c: Column) => sql.raw(`"${getTableName(c.table)}"."${c.name}"`);
