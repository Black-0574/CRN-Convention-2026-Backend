/**
 * Import initial du contenu du site dans la base du back-office (voir src/seed/seed-from-content.ts).
 * Normalement inutile : l'import se lance tout seul au démarrage du back-office. Utile pour
 * initialiser une base hors démarrage. Régénérer d'abord le contenu regroupé si src/content a
 * changé : `node scripts/export-seed-content.mjs` (depuis la racine du dépôt).
 * Exécution : npm run migrate-from-content (depuis backend/).
 */
import { getPayload } from 'payload';

import config from '../payload.config';
import { seedFromContent } from '../src/seed/seed-from-content';

const payload = await getPayload({ config });
// Le démarrage de Payload (onInit) lance déjà l'import si nécessaire ; cet appel attend sa fin.
await seedFromContent(payload);
console.log('— Contenu du site présent dans la base —');
process.exit(0);
