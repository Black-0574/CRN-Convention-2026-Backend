/**
 * Requêtes SQL directes (SQLite), réservées aux opérations qui doivent être atomiques
 * (réservation de stock et de quota, changement d'état d'une commande, consommation d'un droit au
 * scan) : une seule instruction conditionnelle. SQLite sérialise les écritures : deux
 * instructions ne s'entrelacent jamais, ce qui exclut toute survente.
 */
import { sql } from '@payloadcms/db-sqlite';
import type { Payload } from 'payload';

export { sql };

type Requete = ReturnType<typeof sql>;
type Drizzle = { all: <T>(q: Requete) => Promise<T[]> };

export async function lignes<T = Record<string, unknown>>(payload: Payload, requete: Requete): Promise<T[]> {
  return (payload.db as unknown as { drizzle: Drizzle }).drizzle.all<T>(requete);
}

/** Exécute une instruction conditionnelle (avec RETURNING) ; `true` si une ligne a été modifiée. */
export async function modifie(payload: Payload, requete: Requete): Promise<boolean> {
  return (await lignes(payload, requete)).length > 0;
}

/** Horodatage au format stocké par Payload (ISO 8601, UTC). */
export const maintenant = () => new Date().toISOString();
