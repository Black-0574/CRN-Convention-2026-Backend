// Applique les migrations de schéma en attente au démarrage du serveur, avant toute requête.
// Nécessaire sur un hébergement sans accès shell (ex. Hostinger) : npm run migrate ne peut pas
// être lancé à la main avant le premier démarrage en production. adapter.migrate() ne réapplique
// jamais une migration déjà enregistrée (table payload_migrations) — sûr à chaque redémarrage.
//
// Doit vivre dans src/ (pas à la racine du projet) : ce projet utilise un dossier src/app, et
// Next.js ne détecte instrumentation.ts qu'au même niveau que app/ dans ce cas.
//
// Lancé en sous-processus (comme server.js) plutôt qu'avec l'API programmatique de Payload :
// le chargeur de hook d'instrumentation de Next.js ne gère pas l'élision des imports de type
// générés par `payload migrate:create` (ex. `import { MigrateUpArgs } from '@payloadcms/db-sqlite'`,
// un type, pas une valeur), ce qui fait planter un `payload.db.migrate()` direct ici. Le binaire
// payload, lui, le gère correctement (déjà vérifié via server.js et en CLI).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { execFileSync } = await import('node:child_process');
    const path = await import('node:path');
    execFileSync(
      process.execPath,
      [path.resolve(process.cwd(), 'node_modules/payload/bin.js'), 'migrate'],
      { stdio: 'inherit' },
    );
  }
}
