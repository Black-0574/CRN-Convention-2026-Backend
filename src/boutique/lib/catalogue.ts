/**
 * Vue publique du catalogue (vitrine et « mis en avant » du site) : prix du palier en vigueur,
 * paliers et prochaine bascule (compte à rebours), disponibilité par variante, plateformes
 * PUBLIQUES incluses (un repas privé n'apparaît jamais), kit inclus.
 *
 * Vendable = actif ET prix validé ; en démonstration locale (BOUTIQUE_DEMO=1), les produits au prix
 * à valider s'affichent aussi, marqués « aperçu ».
 */
import { palierDepuisJours, palierEnVigueur, prochaineBascule, type Palier } from '../domaine/src/index.ts';
import type { Payload } from 'payload';

import type { Media, Plateforme, Produit, Quota, Variante } from '../../payload-types';

export const DEMO = process.env.BOUTIQUE_DEMO === '1' && process.env.NODE_ENV !== 'production';

/** Fin de la Convention (13 décembre inclus, Libreville) : borne des paliers sans date de fin. */
export const FIN_CONVENTION = '2026-12-13';

const estObjet = <T>(v: number | T | null | undefined): v is T => typeof v === 'object' && v !== null;

export interface VueVariante {
  id: number;
  libelle: string;
  /** Places/articles restants ; `null` = non suivi (illimité). */
  disponible: number | null;
  /** Séances PUBLIQUES propres à la variante (ex. une classe de l'Académie au choix). */
  plateformes: VueSeance[];
}

export interface VueSeance {
  nom: string;
  debut: string | null;
  fin: string | null;
  lieu: string | null;
}

const vueSeances = (liste: (number | Plateforme)[] | null | undefined): VueSeance[] =>
  (liste ?? [])
    .filter(estObjet<Plateforme>)
    .filter((pl) => pl.publique !== false)
    .map((pl) => ({ nom: pl.nom, debut: pl.debut ?? null, fin: pl.fin ?? null, lieu: pl.lieu ?? null }));

export interface VueProduit {
  id: number;
  slug: string;
  nom: string;
  type: Produit['type'];
  categorie: string | null;
  resume: string | null;
  description: string | null;
  badge: string | null;
  photos: { url: string; carte: string; fiche: string; alt: string }[];
  prixXAF: number | null;
  paliers: { prixXAF: number; debut: string; fin: string }[];
  prochaineBascule: string | null;
  nominatif: boolean;
  ageMin: number | null;
  ageMax: number | null;
  variantes: VueVariante[];
  plateformes: VueSeance[];
  /** Articles inclus ; `tailles` non vide = taille à choisir par le titulaire. */
  kit: { nom: string; quantite: number; tailles: string[] }[];
  /** Raison pour laquelle le produit ne peut pas être acheté maintenant, ou `null`. */
  indisponible: string | null;
  apercu: boolean;
  misEnAvant: boolean;
  ordreMiseEnAvant: number;
  ordre: number;
}


export const paliersDe = (p: Pick<Produit, 'paliers'>): Palier[] =>
  (p.paliers ?? []).map((l) => palierDepuisJours({ prixXAF: Number(l.prixXAF), du: l.du, ...(l.au ? { au: l.au } : {}) }));

export const estVisible = (p: Produit) => (p.actif && !p.prixAValider) || (DEMO && Boolean(p.prixAValider));

const restant = (q: Quota) => (q.capacite === null || q.capacite === undefined ? null : q.capacite - (q.vendus ?? 0) - (q.reserves ?? 0));

export async function vueProduit(payload: Payload, p: Produit, maintenant = new Date()): Promise<VueProduit> {
  const variantes = (
    await payload.find({ collection: 'variantes', where: { produit: { equals: p.id }, actif: { equals: true } }, sort: 'ordre', limit: 50, depth: 1 })
  ).docs as Variante[];
  const paliers = paliersDe(p);
  const enVigueur = palierEnVigueur(paliers, maintenant);
  const quotas = (p.quotas ?? []).filter(estObjet<Quota>);
  const kit = await Promise.all(
    (p.kit ?? []).map(async (k) => {
      const kp = estObjet<Produit>(k.produit) ? k.produit : await payload.findByID({ collection: 'produits', id: k.produit, depth: 0 });
      const variantesKit = (await payload.find({ collection: 'variantes', where: { produit: { equals: kp.id }, actif: { equals: true } }, sort: 'ordre', depth: 0 })).docs;
      return { nom: kp.nom, quantite: k.quantite, tailles: variantesKit.length > 1 ? variantesKit.map((v) => v.libelle) : [] };
    }),
  );

  const vues = variantes.map((v) => ({
    id: v.id,
    libelle: v.libelle,
    disponible: v.stock === null || v.stock === undefined ? null : Math.max(0, v.stock - (v.stockVendu ?? 0) - (v.stockReserve ?? 0)),
    plateformes: vueSeances(v.plateformes),
  }));

  let indisponible: string | null = null;
  if (!enVigueur) indisponible = paliers.length === 0 ? 'Non vendu séparément' : 'Hors période de vente';
  else if (quotas.some((q) => restant(q) === null)) indisponible = 'Ouverture des ventes à annoncer';
  else if (quotas.some((q) => (restant(q) ?? 1) <= 0)) indisponible = 'Complet';
  else if (vues.length === 0 || vues.every((v) => v.disponible === 0)) indisponible = 'Épuisé';

  const fin = new Date(new Date(`${FIN_CONVENTION}T00:00:00+01:00`).getTime() + 24 * 3600 * 1000);
  const photos = (p.photos ?? []).filter(estObjet<Media>).map((m) => ({
    url: m.url ?? '',
    carte: m.sizes?.produit?.url ?? m.url ?? '',
    fiche: m.sizes?.fiche?.url ?? m.url ?? '',
    alt: m.alt ?? '',
  }));
  const categorie = estObjet<{ nom: string }>(p.categorie as never) ? (p.categorie as unknown as { nom: string }).nom : null;

  return {
    id: p.id,
    slug: p.slug ?? String(p.id),
    nom: p.nom,
    type: p.type,
    categorie,
    resume: p.resume ?? null,
    description: p.description ?? null,
    badge: p.badge ?? null,
    photos,
    prixXAF: enVigueur?.prixXAF ?? null,
    paliers: paliers.map((pa) => ({ prixXAF: pa.prixXAF, debut: pa.debut.toISOString(), fin: (pa.fin ?? fin).toISOString() })),
    prochaineBascule: paliers.length > 1 ? (prochaineBascule(paliers, maintenant)?.toISOString() ?? null) : null,
    nominatif: p.type === 'pass' || p.type === 'ticket',
    ageMin: p.ageMin ?? null,
    ageMax: p.ageMax ?? null,
    variantes: vues,
    plateformes: vueSeances(p.plateformes),
    kit,
    indisponible,
    apercu: Boolean(p.prixAValider),
    misEnAvant: Boolean(p.misEnAvant),
    ordreMiseEnAvant: p.ordreMiseEnAvant ?? 100,
    ordre: p.ordre ?? 100,
  };
}

export async function catalogue(payload: Payload, maintenant = new Date()): Promise<VueProduit[]> {
  const produits = (await payload.find({ collection: 'produits', limit: 200, depth: 1, sort: 'ordre' })).docs as Produit[];
  const vues = await Promise.all(produits.filter(estVisible).map((p) => vueProduit(payload, p, maintenant)));
  // Les articles de kit sans prix propre ne s'affichent pas comme produits.
  return vues.filter((v) => v.paliers.length > 0);
}
