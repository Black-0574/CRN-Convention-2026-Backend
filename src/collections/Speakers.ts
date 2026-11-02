import type { CollectionConfig } from 'payload';

import { slugify } from '../lib/slugify';

export const Speakers: CollectionConfig = {
  slug: 'speakers',
  labels: { singular: 'Orateur', plural: 'Orateurs' },
  admin: { useAsTitle: 'nom', defaultColumns: ['nom', 'categorie', 'datePublication', 'actif'] },
  access: { read: () => true },
  fields: [
    { name: 'nom', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      label: 'Identifiant d’adresse',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Adresse de la fiche : /orateurs/<identifiant>. Laisser vide pour le déduire du nom.',
      },
      hooks: {
        beforeValidate: [({ value, data }) => (value ? slugify(String(value)) : slugify(String(data?.nom ?? '')))],
      },
    },
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
    {
      name: 'bio',
      type: 'textarea',
      label: 'Biographie',
      admin: {
        rows: 12,
        placeholder: 'Rédigez ici la biographie de l’orateur…',
        description:
          'Publiée sur la fiche de l’orateur (/orateurs/<identifiant>). Séparez les paragraphes par une ligne vide. Pour la retirer, effacez tout le texte : la fiche affiche alors « Biographie à paraître ».',
      },
    },
    { name: 'photo', type: 'upload', relationTo: 'media', admin: { description: 'Photo réelle uniquement — jamais de visage généré par IA.' } },
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
