import type { CollectionConfig } from 'payload';

export const Artists: CollectionConfig = {
  slug: 'artists',
  labels: { singular: 'Artiste', plural: 'Artistes' },
  admin: { useAsTitle: 'nom' },
  access: { read: () => true },
  fields: [
    { name: 'nom', type: 'text', required: true },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
