import type { CollectionConfig } from 'payload';

export const Faq: CollectionConfig = {
  slug: 'faq',
  admin: { useAsTitle: 'question', defaultColumns: ['question', 'ordre', 'actif'] },
  access: { read: () => true },
  defaultSort: 'ordre',
  fields: [
    { name: 'question', type: 'text', required: true },
    { name: 'reponse', type: 'textarea', required: true },
    {
      name: 'etats',
      type: 'select',
      hasMany: true,
      defaultValue: ['campagne', 'evenement', 'prolongement'],
      options: [
        { label: 'Campagne', value: 'campagne' },
        { label: 'Événement', value: 'evenement' },
        { label: 'Prolongement', value: 'prolongement' },
      ],
    },
    { name: 'ordre', type: 'number', required: true },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
