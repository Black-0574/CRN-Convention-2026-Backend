/**
 * Test du contrôle d'accès sur la base réelle (prompt maître, « Tests » : double usage refusé) :
 * billet de test avec deux droits ; premier passage accepté, second refusé avec heure et poste,
 * plateforme non incluse refusée, QR falsifié refusé, scans simultanés : un seul accepté.
 * Données de test supprimées à la fin.
 *
 *   npm run test:scan
 */
import { creerJeton, empreinteJeton } from '../src/boutique/domaine/src/index.ts';
import { getPayload } from 'payload';

import config from '../payload.config';
import { scanner } from '../src/boutique/lib/scan';

const payload = await getPayload({ config });
const s = Date.now();
const p1 = await payload.create({ collection: 'plateformes', data: { code: `test-scan-a-${s}`, nom: 'Test scan A', publique: false } });
const p2 = await payload.create({ collection: 'plateformes', data: { code: `test-scan-b-${s}`, nom: 'Test scan B', publique: false } });
const p3 = await payload.create({ collection: 'plateformes', data: { code: `test-scan-c-${s}`, nom: 'Test scan C (non incluse)', publique: false } });
const produit = await payload.create({ collection: 'produits', data: { nom: `Test scan ${s}`, slug: `test-scan-${s}`, type: 'ticket', actif: false, prixAValider: true } });
const variante = await payload.create({ collection: 'variantes', data: { produit: produit.id, libelle: 'Unique', sku: `test-scan-${s}` } });
const commande = await payload.create({
  collection: 'commandes',
  data: { numero: `TEST-SCAN-${s}`, statut: 'payee', prenom: 'Test', nom: 'Scan', email: 'scan@exemple.org', telephone: '+241 60 00 00 00', totalXAF: 0, jetonSuivi: 'test', lignes: [] },
});
const jeton = creerJeton(process.env.BILLETS_SECRET ?? '');
const titulaire = await payload.create({
  collection: 'titulaires',
  data: { numeroBillet: `TEST-SCAN-${s}-01`, commande: commande.id, produit: produit.id, variante: variante.id, prenom: 'Awa', nom: 'Essono', telephone: '+241 60 00 00 01', email: 'awa@exemple.org', empreinteJeton: empreinteJeton(jeton) },
});
for (const p of [p1, p2]) await payload.create({ collection: 'droits-acces', data: { titulaire: titulaire.id, plateforme: p.id, statut: 'valide' } });

const verifs: [string, boolean][] = [];
const r1 = await scanner(payload, { jeton, plateformeCode: p1.code, poste: 'porte-1' });
verifs.push(['1er passage plateforme A accepté, nom du titulaire affiché', r1.resultat === 'accepte' && r1.titulaire?.nom === 'Essono']);
const r2 = await scanner(payload, { jeton, plateformeCode: p1.code, poste: 'porte-2' });
verifs.push(['2e passage plateforme A refusé, avec heure et poste du 1er', r2.resultat === 'refuse_deja_utilise' && r2.dejaConsommePar === 'porte-1' && Boolean(r2.dejaConsommeA)]);
const r3 = await scanner(payload, { jeton, plateformeCode: p3.code, poste: 'porte-1' });
verifs.push(['plateforme non incluse refusée', r3.resultat === 'refuse_plateforme']);
const r4 = await scanner(payload, { jeton: `${jeton.slice(0, -1)}${jeton.endsWith('A') ? 'B' : 'A'}`, plateformeCode: p2.code, poste: 'porte-1' });
verifs.push(['QR falsifié refusé', r4.resultat === 'refuse_invalide']);
const simultanes = await Promise.all(Array.from({ length: 10 }, (_, i) => scanner(payload, { jeton, plateformeCode: p2.code, poste: `porte-${i}` })));
verifs.push(['10 scans simultanés plateforme B : un seul accepté', simultanes.filter((r) => r.resultat === 'accepte').length === 1]);
const journal = await payload.count({ collection: 'scans', where: { titulaire: { equals: titulaire.id } } });
verifs.push(['chaque scan avec titulaire identifié est journalisé (13)', journal.totalDocs === 13]);

for (const [nom, ok] of verifs) console.log(`${ok ? 'RÉUSSI' : 'ÉCHEC '}  ${nom}`);

await payload.delete({ collection: 'scans', where: { plateforme: { in: [p1.id, p2.id, p3.id] } } });
await payload.delete({ collection: 'droits-acces', where: { titulaire: { equals: titulaire.id } } });
await payload.delete({ collection: 'titulaires', id: titulaire.id });
await payload.delete({ collection: 'commandes', id: commande.id });
await payload.delete({ collection: 'variantes', id: variante.id });
await payload.delete({ collection: 'produits', id: produit.id });
for (const p of [p1, p2, p3]) await payload.delete({ collection: 'plateformes', id: p.id });
process.exit(verifs.every(([, ok]) => ok) ? 0 : 1);
