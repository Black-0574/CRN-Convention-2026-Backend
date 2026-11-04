/**
 * Droits d'accès (correction obligatoire n° 5 du prompt maître) : un pass ouvre plusieurs
 * plateformes ; chaque plateforme (séance datée : une classe de l'Académie un jour donné, le
 * Concert VIP…) fait l'objet d'un droit distinct, consommé séparément au scan. Un second scan du
 * même droit est refusé et journalisé.
 *
 * Fonctions pures : la persistance (table `droitsAcces`, journal `scans`) les applique dans une
 * transaction, avec verrou sur la ligne du droit.
 */

export type StatutDroit = 'valide' | 'consomme' | 'annule';

export interface Droit {
  plateforme: string;
  statut: StatutDroit;
  consommeA?: Date;
  poste?: string;
}

export type ResultatScan =
  | 'accepte'
  | 'refuse_deja_utilise'
  | 'refuse_plateforme'
  | 'refuse_annule'
  | 'refuse_invalide';

export interface Scan {
  plateforme: string;
  poste: string;
  instant: Date;
  resultat: ResultatScan;
  /** Pour un refus « déjà utilisé » : quand et où le droit a été consommé (affiché à l'agent). */
  dejaConsommeA?: Date;
  dejaConsommePar?: string;
}

/** Droits d'un titulaire à partir des plateformes ouvertes par le produit acheté (sans doublon). */
export function genererDroits(plateformes: readonly string[]): Droit[] {
  return [...new Set(plateformes)].map((plateforme) => ({ plateforme, statut: 'valide' }));
}

/**
 * Applique un scan à l'entrée d'une plateforme. Renvoie les droits mis à jour (le droit concerné
 * passe à « consommé » si accepté) et l'entrée de journal — toujours produite, acceptée ou non.
 * `authentique` : résultat de la vérification de signature du jeton (voir jetons.ts).
 */
export function appliquerScan(
  droits: readonly Droit[],
  entree: { plateforme: string; poste: string; instant: Date; authentique: boolean },
): { droits: Droit[]; scan: Scan } {
  const { plateforme, poste, instant } = entree;
  const base = { plateforme, poste, instant };
  if (!entree.authentique) return { droits: [...droits], scan: { ...base, resultat: 'refuse_invalide' } };

  const droit = droits.find((d) => d.plateforme === plateforme);
  if (!droit) return { droits: [...droits], scan: { ...base, resultat: 'refuse_plateforme' } };
  if (droit.statut === 'annule') return { droits: [...droits], scan: { ...base, resultat: 'refuse_annule' } };
  if (droit.statut === 'consomme') {
    return {
      droits: [...droits],
      scan: {
        ...base,
        resultat: 'refuse_deja_utilise',
        ...(droit.consommeA && { dejaConsommeA: droit.consommeA }),
        ...(droit.poste && { dejaConsommePar: droit.poste }),
      },
    };
  }

  const consomme: Droit = { plateforme, statut: 'consomme', consommeA: instant, poste };
  return {
    droits: droits.map((d) => (d === droit ? consomme : d)),
    scan: { ...base, resultat: 'accepte' },
  };
}
