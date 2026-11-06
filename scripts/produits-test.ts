/**
 * Produits de test à 200 F CFA sur le poste local (en production, ils sont créés une fois au
 * démarrage du back-office, voir src/boutique/produits-test.ts). Réservés aux tests : absents des
 * listes de la boutique, achetables par leur lien direct même ventes fermées.
 *
 *   npm run produits-test             crée (ou remet en vente) les trois produits
 *   npm run produits-test -- --retirer les retire de la vente (commandes et billets conservés)
 */
import { getPayload } from 'payload';

import config from '../payload.config';
import { installerProduitsTest, retirerProduitsTest } from '../src/boutique/produits-test';
import { urlBackOffice } from '../src/boutique/lib/urls';

if (process.env.NODE_ENV === 'production' || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(urlBackOffice())) {
  console.error(`Refusé : script réservé au poste local (back-office : ${urlBackOffice()}). En production : Boutique · Produits dans l'admin.`);
  process.exit(1);
}

const payload = await getPayload({ config });
if (process.argv.includes('--retirer')) await retirerProduitsTest(payload);
else await installerProduitsTest(payload, { remettreEnVente: true });
console.log(`Prestataire de paiement local : ${process.env.PAIEMENT_PRESTATAIRE || '(aucun)'}`);
process.exit(0);
