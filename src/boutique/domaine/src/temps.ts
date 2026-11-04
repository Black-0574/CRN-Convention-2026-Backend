/**
 * Heure de Libreville (Africa/Libreville) : UTC+1 toute l'année, sans heure d'été. Toutes les
 * bornes de la boutique (paliers tarifaires, ouvertures, échéances) sont exprimées en jours de
 * Libreville et stockées en instants UTC.
 */
export const DECALAGE_LIBREVILLE_MS = 60 * 60 * 1000;

const JOUR_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Instant UTC de 00h00 à Libreville, le jour donné (« 2026-12-01 » → 2026-11-30T23:00:00Z). */
export function minuitLibreville(jour: string): Date {
  const m = JOUR_ISO.exec(jour);
  if (!m) throw new Error(`Jour attendu au format AAAA-MM-JJ : « ${jour} »`);
  const [, a, mo, j] = m;
  const instant = new Date(Date.UTC(Number(a), Number(mo) - 1, Number(j)) - DECALAGE_LIBREVILLE_MS);
  // Rejette les dates impossibles (ex. 2026-02-30), que Date.UTC décalerait en silence.
  if (jourLibreville(instant) !== jour) throw new Error(`Jour invalide : « ${jour} »`);
  return instant;
}

/** Jour de Libreville (AAAA-MM-JJ) correspondant à un instant. */
export function jourLibreville(instant: Date): string {
  return new Date(instant.getTime() + DECALAGE_LIBREVILLE_MS).toISOString().slice(0, 10);
}
