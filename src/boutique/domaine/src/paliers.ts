/**
 * Paliers tarifaires datés (ex. Pass Convention Intégral : un prix par période). Bornes en
 * instants UTC, construites depuis des jours de Libreville (bascule à 00h00, heure de Libreville).
 * Un palier couvre [debut, fin[ ; `fin` absente = sans limite.
 *
 * Règle métier : le prix affiché au panier est garanti pendant la réservation (15 min) ; à la
 * confirmation du paiement, le serveur applique ce prix si la réservation était encore valide,
 * sinon le palier en vigueur à cet instant.
 */
import { minuitLibreville } from './temps.ts';

export interface Palier {
  prixXAF: number;
  debut: Date;
  fin?: Date;
}

/** Palier exprimé en jours de Libreville : du `du` (inclus, 00h00) au `au` (inclus, 23h59:59.999). */
export interface PalierEnJours {
  prixXAF: number;
  du: string;
  au?: string;
}

export function palierDepuisJours(p: PalierEnJours): Palier {
  const debut = minuitLibreville(p.du);
  if (!p.au) return { prixXAF: p.prixXAF, debut };
  // Fin exclusive : minuit du lendemain du dernier jour.
  const fin = new Date(minuitLibreville(p.au).getTime() + 24 * 60 * 60 * 1000);
  return { prixXAF: p.prixXAF, debut, fin };
}

const contient = (p: Palier, instant: Date) =>
  instant.getTime() >= p.debut.getTime() && (!p.fin || instant.getTime() < p.fin.getTime());

/**
 * Contrôle de cohérence d'une grille : prix entiers positifs, bornes ordonnées, aucun
 * chevauchement (un seul palier actif à un instant donné). Renvoie la liste des erreurs.
 */
export function verifierPaliers(paliers: readonly Palier[]): string[] {
  const erreurs: string[] = [];
  const tries = [...paliers].sort((a, b) => a.debut.getTime() - b.debut.getTime());
  tries.forEach((p, i) => {
    if (!Number.isSafeInteger(p.prixXAF) || p.prixXAF <= 0) erreurs.push(`Palier ${i + 1} : prix invalide (${p.prixXAF}).`);
    if (p.fin && p.fin.getTime() <= p.debut.getTime()) erreurs.push(`Palier ${i + 1} : fin avant le début.`);
    const suivant = tries[i + 1];
    if (suivant && (!p.fin || p.fin.getTime() > suivant.debut.getTime())) {
      erreurs.push(`Paliers ${i + 1} et ${i + 2} : périodes qui se chevauchent.`);
    }
  });
  return erreurs;
}

/** Palier applicable à un instant, ou `null` (avant ouverture / après la dernière période). */
export function palierEnVigueur(paliers: readonly Palier[], instant: Date): Palier | null {
  return paliers.find((p) => contient(p, instant)) ?? null;
}

/** Instant de la prochaine bascule de prix après `instant` (pour le compte à rebours), ou `null`. */
export function prochaineBascule(paliers: readonly Palier[], instant: Date): Date | null {
  const t = instant.getTime();
  const bornes = paliers
    .flatMap((p) => [p.debut, p.fin])
    .filter((d): d is Date => d !== undefined && d.getTime() > t)
    .sort((a, b) => a.getTime() - b.getTime());
  return bornes[0] ?? null;
}

export interface PrixGaranti {
  prixXAF: number;
  /** Instant jusqu'auquel ce prix est garanti (fin de la réservation). */
  garantiJusqua: Date;
}

/**
 * Prix à encaisser à la confirmation du paiement : le prix garanti au panier si la confirmation
 * arrive avant la fin de la réservation ; sinon le palier en vigueur (ou `null` si plus aucun
 * palier ne s'applique : le produit n'est plus vendable).
 */
export function prixAEncaisser(
  paliers: readonly Palier[],
  garanti: PrixGaranti,
  confirmation: Date,
): number | null {
  if (confirmation.getTime() <= garanti.garantiJusqua.getTime()) return garanti.prixXAF;
  return palierEnVigueur(paliers, confirmation)?.prixXAF ?? null;
}
