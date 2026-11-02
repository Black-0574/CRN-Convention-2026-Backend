import type { CollectionConfig } from 'payload';

import { bioField, fonctionField, reseauxSociauxField, slugField } from '../fields/profil';

export const Speakers: CollectionConfig = {
  slug: 'speakers',
  labels: { singular: 'Orateur', plural: 'Orateurs' },
  admin: { useAsTitle: 'nom', defaultColumns: ['nom', 'fonction', 'categorie', 'datePublication', 'actif'] },
  access: { read: () => true },
  fields: [
    { name: 'nom', type: 'text', label: 'Nom', required: true },
    fonctionField('Pasteur principal, CRN Libreville'),
    slugField('orateurs'),
    {
      name: 'categorie',
      type: 'select',
      label: 'Catégorie',
      required: true,
      options: [
        { label: 'Hôte', value: 'hote' },
        { label: 'Orateur international', value: 'international' },
        { label: 'Orateur national', value: 'national' },
        { label: 'Ministère prophétique', value: 'prophetique' },
        { label: 'Intervenante de plateforme', value: 'plateforme' },
      ],
    },
    { name: 'photo', type: 'upload', relationTo: 'media', admin: { description: 'Photo réelle uniquement — jamais de visage généré par IA.' } },
    bioField('orateurs', 'de l’orateur'),
    reseauxSociauxField,
    { name: 'videoInvitation', type: 'text', label: "Vidéo d'invitation" },
    {
      name: 'datePublication',
      type: 'date',
      label: 'Date de publication',
      admin: { description: 'Absente ou future = fiche masquée (révélation progressive, voir isPublished côté site).' },
    },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
