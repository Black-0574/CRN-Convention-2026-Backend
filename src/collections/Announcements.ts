import type { CollectionConfig } from 'payload';

// Catégorie/icône/lien : champs ajoutés lors du passage au back-office (remplacent le mapping
// statique codé en dur dans site/src/lib/announcements.ts). Liste d'icônes alignée sur IconName
// (site/src/components/shared/Icon.astro) — seul un sous-choix pertinent comme icône de
// catégorie est proposé ici (pas les flèches/réseaux sociaux).
export const Announcements: CollectionConfig = {
  slug: 'announcements',
  admin: { useAsTitle: 'titre', defaultColumns: ['titre', 'categorie', 'date', 'actif'] },
  access: { read: () => true },
  defaultSort: 'ordre',
  fields: [
    { name: 'titre', type: 'text', required: true },
    { name: 'texte', type: 'textarea', required: true },
    { name: 'date', type: 'date', required: true },
    { name: 'ordre', type: 'number', required: true },
    { name: 'categorie', type: 'text', required: true, admin: { description: 'Ex. Billetterie, Orateurs, Action sociale.' } },
    {
      name: 'icone',
      type: 'select',
      required: true,
      defaultValue: 'newspaper',
      options: [
        'crown', 'flame', 'building', 'calendar', 'people', 'book', 'music', 'clock', 'pin',
        'play', 'ticket', 'camera', 'newspaper', 'heart', 'wifi', 'mail', 'phone',
      ].map((v) => ({ label: v, value: v })),
    },
    { name: 'lienHref', type: 'text', admin: { description: 'Ex. /billetterie — laisser vide si aucune page associée.' } },
    { name: 'lienLabel', type: 'text', admin: { description: 'Ex. "Voir la billetterie" — par défaut "En savoir plus".' } },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
