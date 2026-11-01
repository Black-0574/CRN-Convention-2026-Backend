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

Le conteneur applique les migrations de schéma automatiquement avant de démarrer (voir
« Migrations de schéma » ci-dessous). L'admin est servi sur `http://localhost:3001/admin`. Au
premier accès, Payload invite à créer le premier compte (rôle admin).

## Démarrage en local sans Docker

```bash
npm install
cp .env.example .env   # DATABASE_URI=file:./crn-convention.db convient tel quel
npm run dev              # http://localhost:3001/admin
```

En mode développement (`npm run dev`), Payload synchronise le schéma automatiquement — pas besoin
de lancer les migrations à la main.

## Migrations de schéma (base de données)

En production (`npm run build` + `npm run start`/`start:hostinger`), contrairement au mode
développement, le schéma n'est **pas** synchronisé automatiquement : il faut appliquer les
migrations une fois avant le premier démarrage, puis à chaque changement de collection/champ.

```bash
npm run migrate:create -- --name description_du_changement   # génère un fichier dans src/migrations/
npm run migrate                                                # applique les migrations en attente
```

Le fichier `src/migrations/20261101_141150.ts` (migration initiale, créant les 8 collections + le
global `Settings`) est déjà généré et commité — il suffit de lancer `npm run migrate` avant le
premier démarrage en production. Avec Docker, c'est fait automatiquement par le conteneur.

## Déploiement sur hébergement mutualisé (Hostinger)

Confirmé disponible dans hPanel (section *Avancé → Node.js App*), versions Node 18/20/22/24
proposées — `backend/package.json` déclare `"engines": {"node": ">=20.9.0"}`, Hostinger doit donc
détecter/proposer 20.x, 22.x ou 24.x automatiquement à partir de ce champ. Aucun Docker nécessaire :
SQLite est un simple fichier.

1. En local : `npm run build` puis `npm run migrate` (une fois, avant le premier déploiement).
2. Transférer le dossier `backend/` (avec `.next/`, `node_modules/`, `src/migrations/`, le fichier
   SQLite déjà migré ou un chemin vide à migrer sur le serveur) vers votre espace Hostinger.
3. Dans hPanel → *Avancé → Node.js App*, créer une application Node.js pointant vers ce dossier,
   avec **`server.js`** comme fichier de démarrage (pas `npm start`) : ce fichier démarre Next.js
   en écoutant sur le port fourni par Hostinger via la variable d'environnement `PORT` — c'est le
   mécanisme standard attendu par ce type d'hébergement (Phusion Passenger), vérifié en local dans
   cette session (`PORT=3055 node server.js` → admin accessible sur ce port).
4. Si vous n'avez pas pu migrer en local avant le transfert, lancer une fois `npm run migrate`
   depuis le terminal Node.js d'hPanel avant de démarrer l'application.
5. Renseigner les variables d'environnement de `.env.example` dans l'interface Node.js d'hPanel
   (`DATABASE_URI` en chemin absolu vers un fichier dans votre espace disque, `PAYLOAD_SECRET`,
   `SITE_URL=https://www.crn-convention2026.events`, `ANTHROPIC_API_KEY`).
6. Vérifier que le dossier contenant le fichier SQLite et `media/` est bien accessible en écriture
   par l'application.

**Écart résiduel, non vérifiable depuis cet environnement** : le comportement exact du démarrage
d'une appli Next.js via l'interface Node.js App d'hPanel (limites mémoire, build effectué en local
ou sur le serveur, détails propres à votre compte) n'a pu être testé que via une simulation locale
équivalente (port assigné par variable d'environnement). À confirmer sur votre panneau réel — voir
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
| `npm run migrate` | Applique les migrations de schéma en attente (requis avant le 1er démarrage en production) |
| `npm run migrate-from-content` | Import unique du contenu existant depuis `../src/content` |
