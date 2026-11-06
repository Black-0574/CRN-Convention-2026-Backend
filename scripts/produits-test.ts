/**
 * Produits de test à 200 F CFA (montant minimal SasPay) pour un vrai paiement depuis un poste de
 * développement : un pass, un ticket et un article, ouvrant une séance de test non publique.
 * Refusé ailleurs qu'en local : ces produits ne doivent jamais exister en production.
 *
 *   npm run produits-test             crée (ou remet en vente) les trois produits
 *   npm run produits-test -- --retirer les retire de la vente (commandes et billets conservés)
 */
import { getPayload } from 'payload';

import config from '../payload.config';
import { urlBackOffice } from '../src/boutique/lib/urls';

const PRIX_XAF = 200;
const SEANCE = 'test-paiement';
const PRODUITS = [
  { slug: 'test-pass-200', nom: 'TEST — Pass (200 F CFA)', type: 'pass', categorie: 'pass' },
  { slug: 'test-ticket-200', nom: 'TEST — Ticket (200 F CFA)', type: 'ticket', categorie: 'tickets' },
  { slug: 'test-article-200', nom: 'TEST — Article (200 F CFA)', type: 'physique', categorie: 'articles' },
] as const;

if (process.env.NODE_ENV === 'production' || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(urlBackOffice())) {
  console.error(`Refusé : produits de test réservés au poste local (back-office : ${urlBackOffice()}).`);
  process.exit(1);
}

const payload = await getPayload({ config });
const retirer = process.argv.includes('--retirer');

if (retirer) {
  for (const p of PRODUITS) {
    const doc = (await payload.find({ collection: 'produits', where: { slug: { equals: p.slug } }, limit: 1, depth: 0 })).docs[0];
    if (doc?.actif) await payload.update({ collection: 'produits', id: doc.id, data: { actif: false } });
    console.log(`${p.nom} : ${doc ? 'retiré de la vente' : 'absent'}`);
  }
  process.exit(0);
}

const seance =
  (await payload.find({ collection: 'plateformes', where: { code: { equals: SEANCE } }, limit: 1, depth: 0 })).docs[0] ??
  (await payload.create({ collection: 'plateformes', data: { code: SEANCE, nom: 'Séance de test (paiement)', publique: false } }));

for (const p of PRODUITS) {
  const categorie = (await payload.find({ collection: 'categories', where: { slug: { equals: p.categorie } }, limit: 1, depth: 0 })).docs[0];
  if (!categorie) throw new Error(`Rayon « ${p.categorie} » introuvable : catalogue local non importé ?`);
  const donnees = {
    nom: p.nom,
    slug: p.slug,
    type: p.type,
    categorie: categorie.id,
    resume: 'Produit de test pour vérifier le paiement SasPay (poste local uniquement).',
    description: 'Produit de test pour vérifier le paiement SasPay de bout en bout. Jamais en production.',
    paliers: [{ prixXAF: PRIX_XAF, du: '2026-11-06' }],
    ...(p.type === 'physique' ? {} : { plateformes: [seance.id] }),
    prixAValider: false,
    ordre: 999,
  };
  let doc = (await payload.find({ collection: 'produits', where: { slug: { equals: p.slug } }, limit: 1, depth: 0 })).docs[0];
  if (doc) doc = await payload.update({ collection: 'produits', id: doc.id, data: { ...donnees, actif: true } as never });
  else {
    // Créé inactif, puis activé une fois sa variante en place (comme le reste du catalogue).
    doc = await payload.create({ collection: 'produits', data: { ...donnees, actif: false } as never });
    await payload.create({ collection: 'variantes', data: { produit: doc.id, libelle: 'Unique', sku: `${p.slug}-unique` } });
    doc = await payload.update({ collection: 'produits', id: doc.id, data: { actif: true } });
  }
  console.log(`${p.nom} : en vente — /boutique/produits/${p.slug}`);
}

const reglages = await payload.findGlobal({ slug: 'reglages-boutique' });
if (!reglages.ventesOuvertes) {
  await payload.updateGlobal({ slug: 'reglages-boutique', data: { ventesOuvertes: true } });
  console.log('Ventes ouvertes sur la base locale.');
}
console.log(`Prestataire de paiement local : ${process.env.PAIEMENT_PRESTATAIRE || '(aucun)'}`);
process.exit(0);
