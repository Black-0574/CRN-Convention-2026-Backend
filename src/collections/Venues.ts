import type { CollectionConfig } from 'payload';

export const Venues: CollectionConfig = {
  slug: 'venues',
  admin: { useAsTitle: 'nom' },
  access: { read: () => true },
  fields: [
    { name: 'nom', type: 'text', required: true },
    { name: 'adresse', type: 'text', required: true },
    { name: 'lienCarte', type: 'text', admin: { description: 'Lien vers une carte statique, jamais une intégration Google Maps (NF-CNV-001).' } },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
