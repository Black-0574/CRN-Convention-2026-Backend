import type { CollectionConfig } from 'payload';

export const Speakers: CollectionConfig = {
  slug: 'speakers',
  admin: { useAsTitle: 'nom', defaultColumns: ['nom', 'categorie', 'datePublication', 'actif'] },
  access: { read: () => true },
  fields: [
    { name: 'nom', type: 'text', required: true },
    {
      name: 'categorie',
      type: 'select',
      required: true,
      options: [
        { label: 'Hôte', value: 'hote' },
        { label: 'Orateur international', value: 'international' },
        { label: 'Orateur national', value: 'national' },
        { label: 'Ministère prophétique', value: 'prophetique' },
        { label: 'Intervenante de plateforme', value: 'plateforme' },
      ],
    },
    { name: 'bio', type: 'textarea' },
    { name: 'photo', type: 'upload', relationTo: 'media', admin: { description: 'Photo réelle uniquement — jamais de visage généré par IA.' } },
    { name: 'videoInvitation', type: 'text' },
    {
      name: 'datePublication',
      type: 'date',
      admin: { description: 'Absente ou future = fiche masquée (révélation progressive, voir isPublished côté site).' },
    },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
