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
      name: 'livraison',
      type: 'group',
      label: 'Livraison des articles et kits',
      admin: {
        description:
          'Modes proposés au client pour les articles achetés en ligne : église du réseau (liste « Églises du réseau »), domicile ou lieu de travail à Libreville (exceptionnel), retrait sur le lieu de la Convention.',
      },
      fields: [
        {
          name: 'retraitConvention',
          type: 'checkbox',
          label: 'Proposer le retrait sur le lieu de la Convention',
          defaultValue: true,
        },
        {
          type: 'row',
          fields: [
            { name: 'lieuRetrait', type: 'text', label: 'Lieu de retrait à la Convention', admin: { width: '50%', description: 'Vide = « À annoncer ».' } },
            { name: 'horairesRetrait', type: 'text', label: 'Horaires de retrait', admin: { width: '50%', description: 'Vide = « À annoncer ».' } },
          ],
        },
        {
          name: 'domicile',
          type: 'group',
          label: 'Livraison à domicile ou au lieu de travail (exceptionnelle)',
          fields: [
            { name: 'actif', type: 'checkbox', label: 'Proposer la livraison à domicile', defaultValue: false },
            {
              type: 'row',
              fields: [
                { name: 'zone', type: 'text', label: 'Zone desservie', defaultValue: 'Libreville', admin: { width: '33%' } },
                {
                  name: 'fraisXAF',
                  type: 'number',
                  label: 'Frais (F CFA)',
                  min: 0,
                  admin: { width: '33%', description: 'Obligatoire pour proposer ce mode ; 0 = offerts.' },
                },
                { name: 'delai', type: 'text', label: 'Délai annoncé', admin: { width: '34%' } },
              ],
            },
            {
              name: 'conditions',
              type: 'textarea',
              label: 'Conditions affichées au client',
              defaultValue: 'Service exceptionnel, réservé à Libreville : un agent de la COM Boutique vous appelle pour convenir du créneau.',
            },
          ],
        },
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
