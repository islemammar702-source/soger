# SOGER – Plateforme e-commerce industrielle + ERP

Site public (catalogue, recherche, panier, commande, espace client) et back-office de gestion (stock, ventes, caisse, achats, facturation, rapports) pour **SOGER – Société Générale de Roulement**.

**Technologies :** Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Drizzle ORM · PostgreSQL / Neon · React Three Fiber · Zod.
Aucune bibliothèque externe pour l'authentification, l'Excel ou les graphiques : moins de dépendances, moins de failles.

---

## 1. Installation locale

```bash
npm install
cp .env.example .env          # Windows : copy .env.example .env — puis renseigner DATABASE_URL
npm run db:migrate            # crée / met à jour les tables (n'efface jamais de données)
npm run db:seed               # rôles, permissions, catégories, marques, dépôt
npm run db:seed -- --demo     # (facultatif) produits de démonstration
npm run admin:create -- --email vous@soger.tn --name "Votre nom"
npm run dev                   # http://localhost:3000  ·  back-office : /admin
```

`admin:create` affiche un **mot de passe provisoire** une seule fois : changez-le après la première connexion.

## 2. Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` puis `npm start` | Version de production |
| `npm run db:generate` | Générer une migration après modification du schéma |
| `npm run db:migrate` | Appliquer les migrations |
| `npm run db:seed` | Référentiels (idempotent) |
| `npm run admin:create -- --email … --name … [--role admin]` | Créer / réactiver un compte du personnel |
| `npm test` | Tests unitaires (+ intégration si `TEST_DATABASE_URL` est défini) |
| `npm run typecheck` · `npm run lint` | Vérifications |

## 3. Rôles

| Rôle | Accès principal |
|---|---|
| Super administrateur | Tout, y compris utilisateurs, rôles et paramètres |
| Administrateur | Toute la gestion, sauf paramètres système |
| Responsable | Ventes, stock, achats, rapports |
| Commercial | Devis, commandes, caisse, clients |
| Magasinier | Stock, réceptions, inventaires |
| Comptable | Factures, paiements, dépenses, rapports, journal |

La matrice module × action est modifiable dans **Utilisateurs → Rôles et permissions** (super administrateur). Toutes les permissions sont vérifiées **côté serveur**.

## 4. Règles du projet

- **Jamais** de `drizzle-kit push` ni de remise à zéro en production : uniquement `db:generate` puis `db:migrate`.
- Le stock ne se modifie **que** via `applyStockMovement()` (`src/server/inventory.ts`), dans une transaction : chaque variation laisse un mouvement tracé.
- Les prix sont **toujours recalculés côté serveur** (panier, commande, devis, caisse).
- Numérotation continue des documents via `nextDocumentNumber()` dans la transaction du document.
- Montants en `numeric(14,3)` (millimes). Prix stockés HT, affichés TTC au public.
- Opérations sensibles enregistrées dans le **journal d'activité**.

## 5. Mise en ligne (Vercel + Neon)

1. **Neon** : créez le projet (région *Frankfurt*), copiez la chaîne de connexion **pooled**.
2. Depuis votre ordinateur, avec `DATABASE_URL` pointant sur Neon :
   ```bash
   npm run db:migrate
   npm run db:seed
   npm run admin:create -- --email vous@soger.tn --name "Votre nom"
   ```
3. **Vercel** : *Add New → Project*, importez le dépôt GitHub `soger`.
4. Variables d'environnement Vercel : `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` (ex. `https://soger.tn`), `APP_SECRET`, et si besoin `CLOUDINARY_URL`, `RESEND_API_KEY`, `MAIL_FROM`, `ANTHROPIC_API_KEY` (lecture automatique des factures fournisseurs).
5. *Deploy*. Chaque `git push` sur `main` redéploie automatiquement.
6. Domaine : *Settings → Domains* sur Vercel, puis les enregistrements DNS indiqués chez votre registraire.

**Avant l'ouverture au public :**
- Complétez **Gestion → Paramètres** (raison sociale, matricule fiscal, RC, adresse, RIB) et `src/config/site.ts` (coordonnées affichées sur le site).
- Faites **valider par votre comptable** : taux de TVA, droit de timbre, mentions obligatoires des factures, numérotation.
- Remplacez les produits de démonstration (import Excel dans **Gestion → Import / export**).

## 6. Structure

```
src/app/(site)/        site public (catalogue, panier, commande, espace client)
src/app/admin/         back-office (layout, pages, exports, API internes)
src/app/documents/     documents imprimables / PDF (devis, facture, ticket…)
src/components/        composants site, back-office, 3D, UI
src/db/schema/         schéma Drizzle (43 tables)
src/db/seed/           seed idempotent
src/server/            accès aux données et actions serveur (auth, stock, ventes, finances…)
drizzle/               migrations SQL
tests/                 tests unitaires et d'intégration
scripts/               scripts d'administration
```

## 7. Limites connues

- Paiement par carte **en ligne** : nécessite un contrat avec une passerelle (ClicToPay, Konnect…) ; non branché.
- PDF : générés par l'impression du navigateur (« Enregistrer au format PDF »), sans moteur côté serveur.
- Mot de passe oublié : réinitialisation par un administrateur (pas d'e-mail automatique sans service d'envoi configuré).
