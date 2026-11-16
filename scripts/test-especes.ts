/**
 * Test du paiement en espèces à la COM Boutique (16 novembre 2026), sur la base réelle :
 * commande avec billets envoyés par WhatsApp seulement (sans e-mail), choix des espèces
 * (réservation de 5 jours), encaissement par un caissier (montant exact, une seule fois, même
 * sous des validations simultanées), billets émis et message WhatsApp prêt, délai dépassé refusé.
 * Données de test supprimées à la fin.
 *
 *   npm run test:especes
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { getPayload } from 'payload';

import config from '../payload.config';
import { DOSSIER_BILLETS } from '../src/boutique/lib/billets';
import { rattraperBilletsManquants } from '../src/boutique/lib/emission';
import { lignes, sql } from '../src/boutique/lib/db';
import { choisirEspeces, encaisserEspeces, journeeDuCaissier } from '../src/boutique/lib/especes';
import { creerCommande, ErreurVente, type EntreeCommande } from '../src/boutique/lib/ventes';
import type { Commande } from '../src/payload-types';

const payload = await getPayload({ config });
const s = Date.now();
const verifs: [string, boolean][] = [];
const echoue = async (f: () => Promise<unknown>, motif: RegExp) => {
  try {
    await f();
    return false;
  } catch (e) {
    return e instanceof ErreurVente && motif.test(e.message);
  }
};

const categorie = (await payload.find({ collection: 'categories', where: { slug: { equals: 'tickets' } }, limit: 1, depth: 0 })).docs[0];
if (!categorie) throw new Error('Rayon « tickets » introuvable : catalogue non importé ?');
const seance = await payload.create({ collection: 'plateformes', data: { code: `test-especes-${s}`, nom: 'Test espèces', publique: false } });
const produit = await payload.create({
  collection: 'produits',
  data: { nom: `Test espèces ${s}`, slug: `test-especes-${s}`, type: 'ticket', categorie: categorie.id, paliers: [{ prixXAF: 10_000, du: '2026-11-01' }], plateformes: [seance.id], prixAValider: false, reserveTests: true, actif: false } as never,
});
const variante = await payload.create({ collection: 'variantes', data: { produit: produit.id, libelle: 'Unique', sku: `test-especes-${s}` } });
await payload.update({ collection: 'produits', id: produit.id, data: { actif: true } });
const caissier = await payload.create({ collection: 'users', data: { email: `caisse-${s}@exemple.org`, password: `Caisse-${s}-x!`, nom: 'Caisse', prenom: 'Test', role: 'com_boutique' } as never });
const agent = { id: Number(caissier.id), nom: 'Test Caisse' };

const entree = (canal: EntreeCommande['canalBillets'], email = '', whatsapp = '077 12 34 56'): EntreeCommande => ({
  client: { prenom: 'Awa', nom: 'Essono', email, telephone: '+241 77 12 34 56' },
  canalBillets: canal,
  whatsapp,
  lignes: [{ varianteId: variante.id, quantite: 2 }],
  titulaires: [
    { ligne: 0, prenom: 'Awa', nom: 'Essono', telephone: '+241 77 12 34 56', email },
    { ligne: 0, prenom: 'Paul', nom: 'Mba', telephone: '+241 66 00 00 00', email },
  ],
  cgvAcceptees: true,
});
const creees: number[] = [];
const nouvelle = async (canal: EntreeCommande['canalBillets'] = 'whatsapp', email = '') => {
  const c = (await creerCommande(payload, entree(canal, email))) as Commande;
  creees.push(c.id);
  return c;
};

// 1. Envoi des billets et e-mail facultatif.
verifs.push(['e-mail exigé si les billets partent par e-mail', await echoue(() => creerCommande(payload, entree('email')), /e-mail invalide/)]);
verifs.push(['numéro WhatsApp invalide refusé', await echoue(() => creerCommande(payload, entree('whatsapp', '', '12')), /WhatsApp invalide/)]);
const c1 = await nouvelle();
verifs.push(['commande WhatsApp seul acceptée sans e-mail (acheteur et titulaires)', c1.email === '' && c1.canalBillets === 'whatsapp' && c1.totalXAF === 20_000]);

// 2. Choix des espèces : réservation prolongée à 5 jours.
const avant = Date.now();
const e1 = await choisirEspeces(payload, c1);
const echeance = new Date(e1.reservationExpireA!).getTime();
const jours = (echeance - avant) / 86_400_000;
const [resa] = await lignes<{ expire_a: string }>(payload, sql`SELECT expire_a FROM reservations WHERE commande_id = ${c1.id} AND statut = 'active'`);
verifs.push(['espèces choisies : places et prix réservés 5 jours', e1.paiement?.prestataire === 'especes' && jours > 4.99 && jours < 5.01 && resa?.expire_a === e1.reservationExpireA]);

// 3. Encaissement : montant exact, puis une seule fois.
verifs.push(['montant différent refusé', await echoue(() => encaisserEspeces(payload, c1.numero, 15_000, agent), /Montant à encaisser/)]);
const r1 = await encaisserEspeces(payload, c1.numero, 20_000, agent);
const payee = (await payload.findByID({ collection: 'commandes', id: c1.id, depth: 0 })) as Commande;
const titulaires = await payload.count({ collection: 'titulaires', where: { commande: { equals: c1.id } } });
verifs.push(['encaissement : commande payée, au nom du caissier', payee.statut === 'payee' && payee.paiement?.moyen === 'especes' && payee.paiement?.encaisseParId === agent.id && payee.paiement?.encaissePar === agent.nom]);
verifs.push(['2 billets émis, sans e-mail des titulaires', titulaires.totalDocs === 2 && r1.billets.length === 2]);
verifs.push(['lien WhatsApp vers +241 77 12 34 56, avec les 2 billets', r1.whatsapp.lien.startsWith('https://wa.me/24177123456?text=') && r1.billets.every((b) => r1.message.includes(b.lien))]);
const journal = await payload.count({ collection: 'journal-actions', where: { and: [{ utilisateur: { equals: agent.id } }, { action: { equals: 'encaissement en espèces' } }] } });
verifs.push(['encaissement inscrit au journal des actions', journal.totalDocs === 1]);
verifs.push(['second encaissement refusé', await echoue(() => encaisserEspeces(payload, c1.numero, 20_000, agent), /déjà encaissée/)]);

// 4. Validations simultanées de la même commande : un seul encaissement.
const c2 = await nouvelle('email_whatsapp', 'awa@exemple.org');
await choisirEspeces(payload, c2);
const simultanes = await Promise.allSettled(Array.from({ length: 5 }, () => encaisserEspeces(payload, c2.numero, 20_000, agent)));
const titulaires2 = await payload.count({ collection: 'titulaires', where: { commande: { equals: c2.id } } });
verifs.push(['5 validations simultanées : un seul encaissement, 2 billets', simultanes.filter((x) => x.status === 'fulfilled').length === 1 && titulaires2.totalDocs === 2]);

// 5. Délai dépassé : commande annulée, places rendues, encaissement refusé.
const c3 = await nouvelle();
await choisirEspeces(payload, c3);
await lignes(payload, sql`UPDATE commandes SET reservation_expire_a = ${new Date(Date.now() - 60_000).toISOString()} WHERE id = ${c3.id}`);
verifs.push(['délai dépassé : encaissement refusé', await echoue(() => encaisserEspeces(payload, c3.numero, 20_000, agent), /Délai de paiement dépassé/)]);
const c3apres = (await payload.findByID({ collection: 'commandes', id: c3.id, depth: 0 })) as Commande;
verifs.push(['délai dépassé : commande expirée', c3apres.statut === 'expiree']);

// 6. Pass avec kit, puis ticket, dans la même commande : 2 billets, kit inscrit une seule fois à
//    remettre (deux défauts de l'émission corrigés le 16 novembre 2026).
const rayonArticles = (await payload.find({ collection: 'categories', where: { slug: { equals: 'articles' } }, limit: 1, depth: 0 })).docs[0];
const rayonPass = (await payload.find({ collection: 'categories', where: { slug: { equals: 'pass' } }, limit: 1, depth: 0 })).docs[0];
const article = await payload.create({
  collection: 'produits',
  data: { nom: `Test kit ${s}`, slug: `test-kit-${s}`, type: 'physique', categorie: rayonArticles!.id, paliers: [{ prixXAF: 1_000, du: '2026-11-01' }], prixAValider: false, reserveTests: true, actif: false } as never,
});
const varianteArticle = await payload.create({ collection: 'variantes', data: { produit: article.id, libelle: 'Unique', sku: `test-kit-${s}` } });
const pass = await payload.create({
  collection: 'produits',
  data: { nom: `Test pass kit ${s}`, slug: `test-pass-kit-${s}`, type: 'pass', categorie: rayonPass!.id, paliers: [{ prixXAF: 50_000, du: '2026-11-01' }], plateformes: [seance.id], kit: [{ produit: article.id, quantite: 1 }], prixAValider: false, reserveTests: true, actif: false } as never,
});
const variantePass = await payload.create({ collection: 'variantes', data: { produit: pass.id, libelle: 'Unique', sku: `test-pass-kit-${s}` } });
await payload.update({ collection: 'produits', id: pass.id, data: { actif: true } });
const mixte = (await creerCommande(payload, {
  ...entree('whatsapp'),
  lignes: [{ varianteId: variantePass.id, quantite: 1 }, { varianteId: variante.id, quantite: 1 }],
  titulaires: [
    { ligne: 0, prenom: 'Awa', nom: 'Essono', telephone: '+241 77 12 34 56', email: '' },
    { ligne: 1, prenom: 'Paul', nom: 'Mba', telephone: '+241 66 00 00 00', email: '' },
  ],
  livraison: { mode: 'convention' },
})) as Commande;
creees.push(mixte.id);
await choisirEspeces(payload, mixte);
const rMixte = await encaisserEspeces(payload, mixte.numero, 60_000, agent);
const kits = await payload.count({ collection: 'retraits', where: { commande: { equals: mixte.id } } });
verifs.push(['pass avec kit puis ticket : 2 billets (Awa, Paul)', rMixte.billets.map((b) => b.titulaire).join(', ') === 'Awa Essono, Paul Mba']);
verifs.push(['pass avec kit puis ticket : kit inscrit une seule fois à remettre', kits.totalDocs === 1]);

// 7. Rattrapage d'une commande payée touchée par l'ancien défaut : billet de Paul absent.
const paul = (await payload.find({ collection: 'titulaires', where: { and: [{ commande: { equals: mixte.id } }, { prenom: { equals: 'Paul' } }] }, limit: 1, depth: 0 })).docs[0]!;
await payload.delete({ collection: 'droits-acces', where: { titulaire: { equals: paul.id } } });
await payload.delete({ collection: 'titulaires', id: paul.id });
await rattraperBilletsManquants(payload);
await rattraperBilletsManquants(payload);
const apresRattrapage = (await payload.find({ collection: 'titulaires', where: { commande: { equals: mixte.id } }, limit: 10, depth: 0, sort: 'numeroBillet' })).docs;
verifs.push(['rattrapage : billet manquant réémis une seule fois', apresRattrapage.map((t) => `${t.numeroBillet.slice(-2)} ${t.prenom}`).join(', ') === '01 Awa, 02 Paul']);

// 8. Caisse du jour du caissier.
const journee = await journeeDuCaissier(payload, agent.id);
verifs.push(['caisse du jour : 3 encaissements, 100 000 F CFA', journee.nombre === 3 && journee.totalXAF === 100_000]);

for (const [nom, ok] of verifs) console.log(`${ok ? 'RÉUSSI' : 'ÉCHEC '}  ${nom}`);

// Nettoyage.
const tous = (await payload.find({ collection: 'commandes', where: { id: { in: creees } }, limit: 100, depth: 0 })).docs;
const billets = (await payload.find({ collection: 'titulaires', where: { commande: { in: creees } }, limit: 100, depth: 0 })).docs;
for (const t of billets) if (t.fichierBillet) await rm(path.join(DOSSIER_BILLETS, t.fichierBillet), { force: true });
await payload.delete({ collection: 'droits-acces', where: { titulaire: { in: billets.map((t) => t.id) } } });
await payload.delete({ collection: 'titulaires', where: { commande: { in: creees } } });
await payload.delete({ collection: 'retraits', where: { commande: { in: creees } } });
await payload.delete({ collection: 'reservations', where: { commande: { in: creees } } });
await payload.delete({ collection: 'journal-actions', where: { utilisateur: { equals: agent.id } } });
await payload.delete({ collection: 'commandes', where: { id: { in: tous.map((c) => c.id) } } });
for (const v of [variante, variantePass, varianteArticle]) await payload.delete({ collection: 'variantes', id: v.id });
for (const p of [pass, produit, article]) await payload.delete({ collection: 'produits', id: p.id });
await payload.delete({ collection: 'plateformes', id: seance.id });
await payload.delete({ collection: 'users', id: caissier.id });
process.exit(verifs.every(([, ok]) => ok) ? 0 : 1);
