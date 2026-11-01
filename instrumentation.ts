// Applique les migrations de schéma en attente au démarrage du serveur, avant toute requête.
// Nécessaire sur un hébergement sans accès shell (ex. Hostinger) : npm run migrate ne peut pas
// être lancé à la main avant le premier démarrage en production. adapter.migrate() ne réapplique
// jamais une migration déjà enregistrée (table payload_migrations) — sûr à chaque redémarrage.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getPayload } = await import('payload');
    const { default: config } = await import('./payload.config');
    const payload = await getPayload({ config });
    await payload.db.migrate();
  }
}
