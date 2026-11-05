/**
 * Dates de la boutique dans le back-office : listes affichées à l'heure de Libreville (cellule
 * `DateLibreville`), quel que soit le fuseau de l'ordinateur qui consulte.
 */
import type { Field } from 'payload';

export const CELLULE_LIBREVILLE = { Cell: '/components/admin/DateLibreville#DateLibreville' };

/** Date et heure (lecture et saisie au jour et à la minute), affichée à l'heure de Libreville en liste. */
export const dateHeure = (name: string, label: string, extra: Partial<Field> = {}): Field =>
  ({
    ...extra,
    name,
    type: 'date',
    label: `${label} (heure de Libreville)`,
    admin: { date: { pickerAppearance: 'dayAndTime' }, components: CELLULE_LIBREVILLE, ...((extra as { admin?: object }).admin ?? {}) },
  }) as Field;

/** Horodatage de création, redéclaré pour l'afficher à l'heure de Libreville (même colonne). */
export const creeLe: Field = {
  name: 'createdAt',
  type: 'date',
  index: true,
  label: 'Créé le (heure de Libreville)',
  admin: { disableBulkEdit: true, hidden: true, components: CELLULE_LIBREVILLE },
};
