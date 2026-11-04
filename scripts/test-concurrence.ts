/**
 * Test de concurrence (prompt maître, « Tests ») : 200 commandes simultanées d'une place sur un
 * quota de 50 → exactement 50 réservations acceptées, aucune survente. S'exécute sur la base
 * locale, dans un quota et un produit créés pour l'occasion puis supprimés.
 *
 *   npm run test:concurrence
 */
import { getPayload } from 'payload';

import config from '../payload.config';
import { lignes, sql } from '../src/boutique/lib/db';
import { creerCommande, ErreurVente, liberer } from '../src/boutique/lib/ventes';

const payload = await getPayload({ config });
const CAPACITE = 50;
const DEMANDES = 200;
const suffixe = Date.now();

const quota = await payload.create({ collection: 'quotas', data: { nom: `Test concurrence ${suffixe}`, capacite: CAPACITE } });
const plateforme = await payload.create({ collection: 'plateformes', data: { code: `test-concurrence-${suffixe}`, nom: 'Test concurrence', publique: false } });
const produit = await payload.create({
  collection: 'produits',
  data: { nom: `Test concurrence ${suffixe}`, slug: `test-concurrence-${suffixe}`, type: 'ticket', paliers: [{ prixXAF: 1000, du: '2026-01-01' }], plateformes: [plateforme.id], quotas: [quota.id], actif: true, prixAValider: false },
});
const variante = await payload.create({ collection: 'variantes', data: { produit: produit.id, libelle: 'Unique', sku: `test-concurrence-${suffixe}` } });

// Adresse propre à ce passage : le nettoyage ne touche QUE les commandes créées par ce test.
const marqueur = `concurrence-${suffixe}.invalid`;
const personne = (i: number) => ({ prenom: 'Test', nom: `Concurrence ${i}`, email: `test${i}@${marqueur}`, telephone: '+241 60 00 00 00' });
const debut = Date.now();
const resultats = await Promise.allSettled(
  Array.from({ length: DEMANDES }, (_, i) =>
    creerCommande(payload, {
      client: personne(i),
      lignes: [{ varianteId: variante.id, quantite: 1 }],
      titulaires: [{ ligne: 0, ...personne(i) }],
      cgvAcceptees: true,
    }),
  ),
);
const duree = Date.now() - debut;

const acceptees = resultats.filter((r) => r.status === 'fulfilled');
const refusees = resultats.filter((r) => r.status === 'rejected');
const autresErreurs = refusees.filter((r) => !(r.reason instanceof ErreurVente) || r.reason.code !== 409);
const [etat] = await lignes<{ capacite: string; vendus: string; reserves: string }>(payload, sql`SELECT capacite, vendus, reserves FROM quotas WHERE id = ${quota.id}`);

console.log(`\n${DEMANDES} commandes simultanées sur un quota de ${CAPACITE} places (${duree} ms) :`);
console.log(`  acceptées : ${acceptees.length}`);
console.log(`  refusées (complet) : ${refusees.length - autresErreurs.length}`);
console.log(`  autres erreurs : ${autresErreurs.length}${autresErreurs.length ? ` — ${(autresErreurs[0] as PromiseRejectedResult).reason}` : ''}`);
console.log(`  quota en base : capacité ${etat?.capacite}, réservées ${etat?.reserves}, vendues ${etat?.vendus}`);

const ok = acceptees.length === CAPACITE && Number(etat?.reserves) === CAPACITE && autresErreurs.length === 0;
console.log(ok ? '\nRÉUSSI : aucune survente.' : '\nÉCHEC : résultat inattendu.');

// Nettoyage : libération puis suppression des données de test.
for (const r of acceptees) await liberer(payload, (r as PromiseFulfilledResult<{ id: number }>).value.id);
const commandes = await payload.find({ collection: 'commandes', where: { email: { like: `@${marqueur}` } }, limit: 1000, depth: 0 });
for (const c of commandes.docs) {
  await payload.delete({ collection: 'reservations', where: { commande: { equals: c.id } } });
  await payload.delete({ collection: 'commandes', id: c.id });
}
await payload.delete({ collection: 'variantes', id: variante.id });
await payload.delete({ collection: 'produits', id: produit.id });
await payload.delete({ collection: 'plateformes', id: plateforme.id });
await payload.delete({ collection: 'quotas', id: quota.id });
process.exit(ok ? 0 : 1);
