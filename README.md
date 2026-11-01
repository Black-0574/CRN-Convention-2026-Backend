# Back-office — Convention CRN 2026 (lot L3)

Payload CMS (Next.js) + SQLite (fichier local, pas de serveur de base de données à part — choisi
pour pouvoir tourner sur un hébergement mutualisé Hostinger, qui ne supporte pas Docker/Postgres).
Gère le contenu publié par le site statique à la racine du dépôt : ajout/modification/suppression/
activation de chaque orateur, séance, tarif, question FAQ, annonce, artiste, lieu et des réglages
globaux (bandeau, état de la Convention).

Voir `C:\Users\Mael\.claude\plans\jaunty-cuddling-kahn.md` (section « Lot L3 ») pour l'architecture
complète, et `../docs/conformite.md` pour la traçabilité des exigences.

## Démarrage en local (Docker, optionnel)

```bash
cp .env.example .env
# éditer .env : PAYLOAD_SECRET (ex. openssl rand -base64 32)
docker compose up --build
```

Les migrations de schéma s'appliquent automatiquement au démarrage (voir « Migrations de schéma »
ci-dessous). L'admin est servi sur `http://localhost:3001/admin`. Au premier accès, Payload invite
à créer le premier compte (rôle admin).

## Démarrage en local sans Docker

```bash
npm install
cp .env.example .env   # DATABASE_URI=file:./crn-convention.db convient tel quel
npm run dev              # http://localhost:3001/admin
```

En mode développement (`npm run dev`), Payload synchronise le schéma automatiquement — pas besoin
de lancer les migrations à la main.

## Migrations de schéma (base de données)

En production, contrairement au mode développement, le schéma n'est pas synchronisé
automatiquement par Payload — mais ce projet applique les migrations en attente **tout seul**, via
l'option officielle `prodMigrations` de l'adaptateur SQLite (`payload.config.ts`) : à la connexion
à la base en production (`NODE_ENV=production`), Payload exécute les migrations de
`src/migrations/index.ts` qui ne l'ont pas encore été (table `payload_migrations`) — sûr à chaque
redémarrage. Fonctionne quel que soit le lanceur (`next start`, `server.js`, Docker, Hostinger).

Aucune étape manuelle n'est donc nécessaire, y compris sur un hébergement sans accès shell.
Les approches par sous-processus (`payload migrate`) ne conviennent pas à Hostinger : son dossier
d'exécution ne contient que les dépendances réellement importées par l'application, pas le
binaire `payload`.

Dans les fichiers de migration générés, garder les types en `import type` (ex.
`import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'`) : ils sont
maintenant inclus dans le bundle serveur, où un import de type écrit comme une valeur échoue au
chargement.

Après avoir modifié une collection ou un champ, générer la nouvelle migration et la commiter
(elle s'appliquera automatiquement au prochain démarrage) :

```bash
npm run migrate:create -- --name description_du_changement   # génère un fichier dans src/migrations/
```

Le fichier `src/migrations/20261101_141150.ts` (migration initiale, créant les 8 collections + le
global `Settings`) est déjà généré et commité.

## Déploiement sur hébergement mutualisé (Hostinger)

Confirmé disponible sur l'offre du Commanditaire (hPanel → *Websites → Add Website → Node.js web
app*, versions Node 18/20/22/24 — `backend/package.json` déclare `"engines": {"node": ">=20.9.0"}`,
donc 20.x/22.x/24.x conviennent). Aucun Docker nécessaire : SQLite est un simple fichier.

**Sous-domaine dédié, pas un chemin sur le domaine principal.** L'admin sert aussi des routes
`/api/...` (REST/GraphQL Payload, `/api/chat` pour NASTY) dont le site public, le widget de chat et
l'admin lui-même ont besoin ; un montage par chemin (ex. `crn-convention2026.events/admin`) ne
couvrirait pas ces routes. Adresse retenue : **`admin.crn-convention2026.events`**.

**Configuration en place (plan « Unlimited », qui inclut les applications Node.js ; le plan
« Premium » ne les inclut pas) :**

- **Dépôt connecté** : `Black-0574/CRN-Convention-2026-Backend-Hostinger` (privé). Hostinger l'a
  créé lui-même à la mise en place, comme copie du dépôt public
  `Black-0574/CRN-Convention-2026-Backend` (racine = contenu de `backend/`) — Hostinger clone un
  dépôt tel quel, sans réglage de sous-dossier. **Déploiement automatique** à chaque push sur sa
  branche `main`.
- **Réglages détectés** : préréglage *Next.js*, Node 20.x, `npm run build`, sortie `.next`, racine
  `./`, aucun fichier d'entrée (Hostinger lance Next.js lui-même, derrière son proxy ;
  `server.js` ne sert qu'en dehors de Hostinger).
- **Variables d'environnement** (hPanel → site → *Variables d'environnement*) :
  - `DATABASE_URI=file:/home/u227552786/domains/admin.crn-convention2026.events/crn-convention.db`
  - `MEDIA_DIR=/home/u227552786/domains/admin.crn-convention2026.events/media`
  - `PAYLOAD_SECRET` (saisi par le Commanditaire, jamais commité)
  - `SITE_URL=https://www.crn-convention2026.events`
  - `ANTHROPIC_API_KEY` (optionnelle, à ajouter quand NASTY doit répondre)

  **Chemins absolus obligatoires** pour la base et les médias : chaque déploiement reconstruit
  l'application dans un nouveau dossier (`…/hbuilds/versions/<id>/nodejs/`) ; avec un chemin
  relatif, chaque mise en ligne repartirait d'une base vide et perdrait les photos.

**Mettre à jour le back-office en ligne** après un changement dans `backend/` (depuis la racine du
dépôt principal, qui reste la seule source de vérité) :

```bash
git subtree split --prefix=backend -b backend-export
git push https://github.com/Black-0574/CRN-Convention-2026-Backend.git backend-export:main --force
git push https://github.com/Black-0574/CRN-Convention-2026-Backend-Hostinger.git backend-export:main --force
git branch -D backend-export
```

Le second push déclenche le redéploiement. Le schéma de base de données se met à jour tout seul
au démarrage (voir « Migrations de schéma »), hPanel n'offrant pas de terminal sur cette offre.

`npm run migrate-from-content` (import du contenu du dépôt principal) nécessite un accès shell :
à lancer en local avec `DATABASE_URI` pointant vers une copie du fichier SQLite de production,
puis réenvoyer le fichier via le gestionnaire de fichiers d'hPanel.

## Import du contenu existant

Une fois l'application démarrée (migrations appliquées, Docker ou non) et un compte créé :

```bash
npm run migrate-from-content
# ou, avec Docker : docker compose exec payload npm run migrate-from-content
```

Lit `../src/content/**/*.json` (site Astro) et crée les documents correspondants en base — ne
migre que du contenu réel déjà présent dans le dépôt, n'invente rien. Les photos référencées dans
`../public/images/...` sont téléversées dans la collection `media`.

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement (Next.js + Payload) |
| `npm run build` | Build de production |
| `npm run start` | Service de production (port fixe 3001) |
| `npm run start:hostinger` | Service de production via `server.js` (port depuis `process.env.PORT`) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run generate:types` | Régénère `src/payload-types.ts` à partir des collections |
| `npm run generate:importmap` | Régénère la carte d'import de l'admin (après ajout de composants personnalisés) |
| `npm run migrate:create` | Génère un fichier de migration de schéma après modification d'une collection |
| `npm run migrate` | Applique les migrations de schéma en attente manuellement (fait automatiquement au démarrage en production, voir « Migrations de schéma ») |
| `npm run migrate-from-content` | Import unique du contenu existant depuis `../src/content` |
