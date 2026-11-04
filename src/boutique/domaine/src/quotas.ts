/**
 * Quotas et stocks (F03) : réservation pendant 15 minutes dès l'engagement du paiement,
 * conversion en vente à la confirmation, libération à l'échec ou à l'expiration. Aucune survente :
 * une réservation n'est acceptée que si `capacite - vendus - reserves >= quantite`.
 *
 * Modèle de référence, pur : en base, la même règle s'exécute en une seule instruction atomique
 * (`UPDATE quotas SET reserves = reserves + n WHERE id = $1 AND capacite - vendus - reserves >= n`),
 * ce qui garantit l'absence de survente même sous forte concurrence.
 */
export const DUREE_RESERVATION_MS = 15 * 60 * 1000;

export interface Quota {
  capacite: number;
  vendus: number;
  reserves: number;
}

export const disponible = (q: Quota) => q.capacite - q.vendus - q.reserves;

function verifierQuantite(n: number): void {
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Quantité invalide : ${n}`);
}

/** Réserve `n` places, ou renvoie `null` s'il n'en reste pas assez (rien n'est modifié). */
export function reserver(q: Quota, n: number): Quota | null {
  verifierQuantite(n);
  return disponible(q) >= n ? { ...q, reserves: q.reserves + n } : null;
}

/** Paiement confirmé : les places réservées deviennent vendues. */
export function confirmer(q: Quota, n: number): Quota {
  verifierQuantite(n);
  if (q.reserves < n) throw new Error('Confirmation supérieure aux places réservées.');
  return { ...q, reserves: q.reserves - n, vendus: q.vendus + n };
}

/** Échec ou expiration du paiement : les places reviennent à la vente. */
export function liberer(q: Quota, n: number): Quota {
  verifierQuantite(n);
  if (q.reserves < n) throw new Error('Libération supérieure aux places réservées.');
  return { ...q, reserves: q.reserves - n };
}

export const finReservation = (debut: Date) => new Date(debut.getTime() + DUREE_RESERVATION_MS);
