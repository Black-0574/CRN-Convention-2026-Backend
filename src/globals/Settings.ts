import type { GlobalConfig } from 'payload';

// Document unique (global, pas une collection) — état courant de la Convention + bandeau
// d'info, même forme que src/content/settings/etat-convention.json côté site.
export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Réglages',
  access: { read: () => true },
  fields: [
    {
      name: 'etatActuel',
      type: 'select',
      label: 'État actuel',
      required: true,
      defaultValue: 'campagne',
      options: [
        { label: 'Campagne', value: 'campagne' },
        { label: 'Événement', value: 'evenement' },
        { label: 'Prolongement', value: 'prolongement' },
      ],
    },
    { name: 'forcageManuel', type: 'checkbox', label: 'Forçage manuel', defaultValue: false, admin: { description: 'Force etatActuel plutôt que de le déduire des bascules ci-dessous.' } },
    {
      name: 'bascules',
      type: 'group',
      label: 'Bascules',
      fields: [
        { name: 'campagneDebut', type: 'date', label: 'Début de la campagne', required: true },
        { name: 'evenementDebut', type: 'date', label: "Début de l'événement", required: true },
        { name: 'prolongementDebut', type: 'date', label: 'Début du prolongement', required: true },
        { name: 'ecosystemeVisibleDes', type: 'date', label: "Écosystème visible dès", required: true },
      ],
    },
    {
      name: 'bandeau',
      type: 'group',
      label: 'Bandeau',
      fields: [
        { name: 'actif', type: 'checkbox', label: 'Actif', defaultValue: false },
        { name: 'texte', type: 'text', label: 'Texte' },
        { name: 'lien', type: 'text', label: 'Lien' },
      ],
    },
    {
      // Posé une fois l'import initial du contenu du site terminé (src/seed) : l'import ne se
      // relance jamais, même si une collection est ensuite vidée volontairement depuis l'admin.
      name: 'contenuInitialImporte',
      type: 'checkbox',
      defaultValue: false,
      admin: { hidden: true },
    },
  ],
};
