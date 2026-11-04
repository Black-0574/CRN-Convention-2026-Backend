/**
 * Logistique des articles achetés en ligne (articles officiels et kits des pass) : livraison dans
 * une église du réseau CRN, au Gabon ou hors du Gabon. La liste est saisie par le CRN : aucune
 * église n'est inventée ; tant qu'elle est vide, ce mode n'est pas proposé.
 */
import type { CollectionConfig } from 'payload';

import { reserveA, tout } from '../lib/acces';

export const PointsLivraison: CollectionConfig = {
  slug: 'points-livraison',
  labels: { singular: 'Église du réseau (livraison)', plural: 'Églises du réseau (livraison)' },
  admin: {
    useAsTitle: 'nom',
    defaultColumns: ['nom', 'ville', 'pays', 'fraisXAF', 'actif'],
    group: 'Boutique · Logistique',
    description: 'Églises du réseau où les clients peuvent se faire livrer leurs articles et kits, au Gabon ou hors du Gabon.',
  },
  access: { read: tout, create: reserveA('catalogue', 'com_boutique'), update: reserveA('catalogue', 'com_boutique'), delete: reserveA() },
  fields: [
    { name: 'nom', type: 'text', required: true, admin: { description: 'Ex. « CRN — Église de … ».' } },
    {
      type: 'row',
      fields: [
        { name: 'ville', type: 'text', required: true, admin: { width: '50%' } },
        { name: 'pays', type: 'text', required: true, admin: { width: '50%' } },
      ],
    },
    { name: 'adresse', type: 'textarea', admin: { rows: 2 } },
    {
      type: 'row',
      fields: [
        { name: 'horaires', type: 'text', label: 'Horaires de retrait', admin: { width: '50%' } },
        { name: 'contact', type: 'text', label: 'Contact sur place', admin: { width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'fraisXAF',
          type: 'number',
          label: 'Frais de livraison (F CFA)',
          required: true,
          min: 0,
          admin: { width: '50%', description: 'Facturés au client par commande ; 0 = offerts.' },
        },
        { name: 'delai', type: 'text', label: 'Délai annoncé', admin: { width: '50%', description: 'Ex. « 5 à 10 jours ». Vide = « à confirmer ».' } },
      ],
    },
    { name: 'ordre', type: 'number', defaultValue: 100, admin: { position: 'sidebar' } },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
