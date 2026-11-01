import type { GlobalConfig } from 'payload';

// Document unique (global, pas une collection) — état courant de la Convention + bandeau
// d'info, même forme que src/content/settings/etat-convention.json côté site.
export const Settings: GlobalConfig = {
  slug: 'settings',
  access: { read: () => true },
  fields: [
    {
      name: 'etatActuel',
      type: 'select',
      required: true,
      defaultValue: 'campagne',
      options: [
        { label: 'Campagne', value: 'campagne' },
        { label: 'Événement', value: 'evenement' },
        { label: 'Prolongement', value: 'prolongement' },
      ],
    },
    { name: 'forcageManuel', type: 'checkbox', defaultValue: false, admin: { description: 'Force etatActuel plutôt que de le déduire des bascules ci-dessous.' } },
    {
      name: 'bascules',
      type: 'group',
      fields: [
        { name: 'campagneDebut', type: 'date', required: true },
        { name: 'evenementDebut', type: 'date', required: true },
        { name: 'prolongementDebut', type: 'date', required: true },
        { name: 'ecosystemeVisibleDes', type: 'date', required: true },
      ],
    },
    {
      name: 'bandeau',
      type: 'group',
      fields: [
        { name: 'actif', type: 'checkbox', defaultValue: false },
        { name: 'texte', type: 'text' },
        { name: 'lien', type: 'text' },
      ],
    },
  ],
};
