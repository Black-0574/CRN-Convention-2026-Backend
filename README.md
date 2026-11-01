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
automatiquement par Payload — mais ce projet applique les migrations en attente **tout seul, au
démarrage du serveur**, avant de servir la première requête :
- `npm run start` (`next start`) : via `instrumentation.ts`, le hook de démarrage standard de
  Next.js.
- `npm run start:hostinger` (`server.js`, serveur personnalisé) : Next.js n'appelle pas
  automatiquement `instrumentation.ts` derrière un serveur personnalisé, donc `server.js` lance
  lui-même `payload migrate` (en sous-processus) avant d'ouvrir le port.

Aucune étape manuelle n'est donc nécessaire avant le premier démarrage en production, y compris
sur un hébergement sans accès shell (Hostinger). `adapter.migrate()` ne réapplique jamais une
migration déjà enregistrée (table `payload_migrations`) — sûr à chaque redémarrage.

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

**Dépôt Git dédié.** Hostinger clone le dépôt connecté tel quel (pas de réglage de sous-dossier
documenté) ; `backend/` n'est qu'un sous-dossier du dépôt principal
(`CRN-Convention-2026`), donc un dépôt séparé a été créé juste pour le déploiement :
**`https://github.com/Black-0574/CRN-Convention-2026-Backend`** (privé, racine = contenu actuel de
`backend/`, historique Git conservé). Le dépôt principal reste la source de vérité pour le
développement ; resynchroniser ce second dépôt après un changement dans `backend/` avec :

```bash
# depuis la racine du dépôt principal
git subtree split --prefix=backend -b backend-export
git push https://github.com/Black-0574/CRN-Convention-2026-Backend.git backend-export:main --force
git branch -D backend-export
```

**Étapes dans hPanel :**

1. *Websites → Add Website → Node.js web app*.
2. Source : **Git** → se connecter à GitHub (ou coller l'URL du dépôt s'il est rendu public) → choisir
   `CRN-Convention-2026-Backend`, branche `main`.
3. Domaine : `admin.crn-convention2026.events` (créé à cette étape ou en amont dans *Domaines →
   Sous-domaines* — si déjà créé comme site séparé, le supprimer avant de relancer cette étape,
   selon la documentation Hostinger).
4. Réglages de déploiement :
   - **Node.js version** : 20, 22 ou 24.
   - **Build command** : `npm run build`.
   - **Entry file** : **`server.js`** (pas `npm start`) — démarre Next.js en écoutant sur le port
     fourni par Hostinger via `process.env.PORT`, testé en local dans cette session
     (`PORT=3055 node server.js` → admin accessible sur ce port). Si Hostinger ne fournit pas
     `PORT`, `server.js` retombe sur 3001 par défaut.
   - **Environment variables** : `DATABASE_URI` (chemin absolu vers un fichier dans votre espace,
     ex. `file:/home/<compte>/crn-convention.db`), `PAYLOAD_SECRET` (générer avec
     `openssl rand -base64 32`, ne jamais réutiliser celui du `.env` local), `SITE_URL=https://www.crn-convention2026.events` (site public, pour les en-têtes CORS), `ANTHROPIC_API_KEY`.
5. Déployer. Le schéma de base de données se crée automatiquement au premier démarrage (voir
   « Migrations de schéma » ci-dessus) — hPanel ne propose pas de terminal pour cette offre, ce
   n'est donc pas une étape manuelle à faire. `/admin/create-first-user` doit s'afficher directement.
6. Vérifier que le dossier contenant le fichier SQLite et `media/` est accessible en écriture par
   l'application. Si besoin d'importer le contenu déjà présent dans le dépôt principal
   (`npm run migrate-from-content`), cette commande nécessite un accès shell — à faire en local
   avec `DATABASE_URI` pointant vers une copie du fichier SQLite de production, puis réuploader le
   fichier.
7. Une fois `admin.crn-convention2026.events/admin` accessible, mettre à jour sur le site public
   (dépôt principal) les variables `PAYLOAD_API_URL=https://admin.crn-convention2026.events/api` et
   `PUBLIC_CHAT_API_URL=https://admin.crn-convention2026.events/api/chat`, puis reconstruire/republier
   le site statique pour que le widget NASTY cible la bonne adresse.

**Écart résiduel, non vérifiable depuis cet environnement** : le comportement exact du démarrage
d'une appli Next.js via *Node.js web app* d'hPanel (limites mémoire, build effectué sur le serveur,
réglage exact du port) n'a pu être testé que via une simulation locale équivalente (port assigné
par variable d'environnement). À confirmer sur le panneau réel du Commanditaire — voir
`docs/conformite.md`. En cas d'incompatibilité malgré cette préparation, la solution de repli reste
un VPS séparé.

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
