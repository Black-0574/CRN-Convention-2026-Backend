/**
 * Montants : entiers en F CFA (XAF, devise pivot, sans décimales). Les euros sont dérivés à la
 * parité fixe 1 € = 655,957 F CFA et arrondis à l'euro pour l'affichage.
 * Typographie (règle permanente) : espace fine insécable (U+202F) entre les milliers, espace
 * insécable (U+00A0) avant l'unité — « 150 000 F CFA ».
 */
export const PARITE_EUR_XAF = 655.957;

const ESPACE_FINE = ' ';
const ESPACE_INSECABLE = ' ';

function verifierXAF(montant: number): void {
  if (!Number.isSafeInteger(montant) || montant < 0) {
    throw new Error(`Montant XAF invalide (entier positif attendu) : ${montant}`);
  }
}

function grouperMilliers(entier: number): string {
  return String(entier).replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE);
}

/** « 150 000 F CFA » */
export function formaterXAF(montant: number): string {
  verifierXAF(montant);
  return `${grouperMilliers(montant)}${ESPACE_INSECABLE}F${ESPACE_INSECABLE}CFA`;
}

/** Conversion à la parité fixe, arrondie à l'euro le plus proche (affichage uniquement). */
export function xafVersEurArrondi(montant: number): number {
  verifierXAF(montant);
  return Math.round(montant / PARITE_EUR_XAF);
}

/** « 229 € » — affiché à côté du prix en F CFA, jamais seul. */
export function formaterEUR(montantXAF: number): string {
  return `${grouperMilliers(xafVersEurArrondi(montantXAF))}${ESPACE_INSECABLE}€`;
}
