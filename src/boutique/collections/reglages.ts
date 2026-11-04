import type { GlobalConfig } from 'payload';

import { reserveA, tout } from '../lib/acces';

/** Réglages de la boutique (distincts des réglages du site : bandeau, état de la Convention). */
export const ReglagesBoutique: GlobalConfig = {
  slug: 'reglages-boutique',
  label: 'Réglages de la boutique',
  admin: { group: 'Boutique · Réglages' },
  access: { read: tout, update: reserveA() },
  fields: [
    { name: 'ventesOuvertes', type: 'checkbox', label: 'Ventes ouvertes', defaultValue: true },
    {
      type: 'row',
      fields: [
        { name: 'lieuRetrait', type: 'text', label: 'Lieu de retrait des articles et kits', admin: { description: 'Vide = « À annoncer ».' } },
        { name: 'horairesRetrait', type: 'text', label: 'Horaires de retrait', admin: { description: 'Vide = « À annoncer ».' } },
      ],
    },
    {
      name: 'consentement',
      type: 'group',
      label: 'Consentement « être recontacté »',
      fields: [
        {
          name: 'texte',
          type: 'textarea',
          defaultValue: 'J’accepte d’être recontacté par le CRN au sujet de ses activités (case facultative, indépendante de l’achat).',
        },
        { name: 'version', type: 'text', defaultValue: '2026-11-04' },
      ],
    },
    {
      name: 'legal',
      type: 'group',
      label: 'Textes légaux de la boutique (fournis par le CRN)',
      admin: { description: 'Obligatoires avant la première vente réelle. Vides = « À fournir par le CRN ».' },
      fields: [
        { name: 'cgvVersion', type: 'text', label: 'Version des CGV' },
        { name: 'cgv', type: 'textarea', label: 'Conditions générales de vente' },
      ],
    },
    { name: 'contenuImporte', type: 'checkbox', defaultValue: false, admin: { hidden: true } },
  ],
};
