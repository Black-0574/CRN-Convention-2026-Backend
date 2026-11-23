/**
 * Ajoute à une base déjà importée les articles officiels annoncés le 5 novembre 2026 (pins, huile
 * d'onction, polo, casquette), puis les tee-shirts officiels des gammes 1 à 4 (23 novembre 2026,
 * mis en vente à 10 000 F CFA, couleurs × tailles S à 4XL ; polo et casquette retirés). Sans
 * effet sur les articles déjà présents ou modifiés dans l'admin.
 *
 *   npm run ajouter-articles
 */
import { getPayload } from 'payload';

import config from '../payload.config';
import { ajouterArticlesAnnonces, ajouterTeeShirtsGammes, mettreEnVenteTeeShirtsGammes } from '../src/boutique/seed';

const payload = await getPayload({ config });
await ajouterArticlesAnnonces(payload);
await ajouterTeeShirtsGammes(payload);
await mettreEnVenteTeeShirtsGammes(payload);
process.exit(0);
