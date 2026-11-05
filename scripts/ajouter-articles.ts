/**
 * Ajoute à une base déjà importée les articles officiels annoncés le 5 novembre 2026 (pins, huile
 * d'onction, polo, casquette), en « Prix à valider ». Sans effet sur les articles déjà présents.
 *
 *   npm run ajouter-articles
 */
import { getPayload } from 'payload';

import config from '../payload.config';
import { ajouterArticlesAnnonces } from '../src/boutique/seed';

const payload = await getPayload({ config });
await ajouterArticlesAnnonces(payload);
process.exit(0);
