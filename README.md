# SOGER – Plateforme e-commerce industrielle + ERP

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Drizzle ORM · PostgreSQL / Neon · React Three Fiber.

## Démarrage

```bash
cp .env.example .env        # renseigner DATABASE_URL
npm install
npm run db:migrate          # applique les migrations (n'efface jamais de données)
npm run db:seed             # rôles, permissions, catégories, marques, dépôt
npm run db:seed -- --demo   # + 39 produits de démonstration
npm run dev
```

## Règles du projet

- **Jamais** de `drizzle-kit push` ni de reset en production : uniquement `db:generate` puis `db:migrate`.
- Le stock ne se modifie **que** via `applyStockMovement()` (`src/server/inventory.ts`), dans une transaction.
- Numérotation des documents via `nextDocumentNumber()` (`src/server/sequences.ts`), dans la transaction du document.
- Montants en `numeric(14,3)` (dinars, millimes). Prix stockés HT, affichés TTC au public.
- Permissions : `src/lib/permissions.ts` (module × action), vérifiées côté serveur.
- Coordonnées de l'entreprise : `src/config/site.ts` (valeurs `TODO` à compléter).

## Structure

```
src/app/(site)/        site public
src/components/site/   composants du site
src/components/three/  scène 3D du hero (chargée à la demande)
src/db/schema/         schéma Drizzle (36 tables)
src/db/seed/           seed idempotent
src/server/            accès données et actions serveur
drizzle/               migrations SQL
```
