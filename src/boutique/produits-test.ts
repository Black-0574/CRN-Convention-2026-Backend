/**
 * Produits de test à 200 F CFA (montant minimal SasPay) pour de vrais paiements par les équipes :
 * un pass, un ticket et un article, ouvrant une séance de test non publique. « Réservés aux
 * tests » : jamais listés dans la boutique, achetables par leur lien direct même ventes fermées.
 */
import type { Payload } from 'payload';

const PRIX_XAF = 200;
const SEANCE = 'test-paiement';
export const PRODUITS_TEST = [
  { slug: 'test-pass-200', nom: 'TEST — Pass (200 F CFA)', type: 'pass', categorie: 'pass' },
  { slug: 'test-ticket-200', nom: 'TEST — Ticket (200 F CFA)', type: 'ticket', categorie: 'tickets' },
  { slug: 'test-article-200', nom: 'TEST — Article (200 F CFA)', type: 'physique', categorie: 'articles' },
] as const;

const produitDe = async (payload: Payload, slug: string) =>
  (await payload.find({ collection: 'produits', where: { slug: { equals: slug } }, limit: 1, depth: 0 })).docs[0];

/**
 * Crée (ou remet en vente avec `remettreEnVente`) les trois produits de test. Sans cette option,
 * un produit déjà présent n'est jamais touché : retiré depuis l'admin, il le reste.
 */
export async function installerProduitsTest(payload: Payload, { remettreEnVente = false } = {}): Promise<void> {
  const seance =
    (await payload.find({ collection: 'plateformes', where: { code: { equals: SEANCE } }, limit: 1, depth: 0 })).docs[0] ??
    (await payload.create({ collection: 'plateformes', data: { code: SEANCE, nom: 'Séance de test (paiement)', publique: false } }));

  for (const p of PRODUITS_TEST) {
    const existant = await produitDe(payload, p.slug);
    if (existant && !remettreEnVente) continue;
    const categorie = (await payload.find({ collection: 'categories', where: { slug: { equals: p.categorie } }, limit: 1, depth: 0 })).docs[0];
    if (!categorie) throw new Error(`Rayon « ${p.categorie} » introuvable : catalogue non importé ?`);
    const donnees = {
      nom: p.nom,
      slug: p.slug,
      type: p.type,
      categorie: categorie.id,
      resume: 'Produit de test pour vérifier le paiement de bout en bout (équipes du CRN).',
      description: 'Produit de test pour vérifier le paiement, le billet et l’e-mail de bout en bout. Réservé aux équipes du CRN : non listé dans la boutique.',
      paliers: [{ prixXAF: PRIX_XAF, du: '2026-11-06' }],
      ...(p.type === 'physique' ? {} : { plateformes: [seance.id] }),
      prixAValider: false,
      reserveTests: true,
      misEnAvant: false,
      ordre: 999,
    };
    if (existant) {
      await payload.update({ collection: 'produits', id: existant.id, data: { ...donnees, actif: true } as never });
    } else {
      // Créé inactif, puis activé une fois sa variante en place (comme le reste du catalogue).
      const cree = await payload.create({ collection: 'produits', data: { ...donnees, actif: false } as never });
      await payload.create({ collection: 'variantes', data: { produit: cree.id, libelle: 'Unique', sku: `${p.slug}-unique` } });
      await payload.update({ collection: 'produits', id: cree.id, data: { actif: true } });
    }
    payload.logger.info(`Produit de test en vente (lien direct) : ${p.nom} — /boutique/produits/${p.slug}`);
  }
}

/** Retire les produits de test de la vente (commandes, billets et paiements conservés). */
export async function retirerProduitsTest(payload: Payload): Promise<void> {
  for (const p of PRODUITS_TEST) {
    const doc = await produitDe(payload, p.slug);
    if (doc?.actif) await payload.update({ collection: 'produits', id: doc.id, data: { actif: false } });
    payload.logger.info(`${p.nom} : ${doc ? 'retiré de la vente' : 'absent'}`);
  }
}
