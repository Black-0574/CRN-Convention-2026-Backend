import type { CollectionConfig } from 'payload';

// Catégorie/icône/lien : champs ajoutés lors du passage au back-office (remplacent le mapping
// statique codé en dur dans site/src/lib/announcements.ts). Liste d'icônes alignée sur IconName
// (site/src/components/shared/Icon.astro) — seul un sous-choix pertinent comme icône de
// catégorie est proposé ici (pas les flèches/réseaux sociaux).
export const Announcements: CollectionConfig = {
  slug: 'announcements',
  labels: { singular: 'Annonce', plural: 'Annonces' },
  admin: { useAsTitle: 'titre', defaultColumns: ['titre', 'categorie', 'date', 'actif'] },
  access: { read: () => true },
  defaultSort: 'ordre',
  fields: [
    { name: 'titre', type: 'text', required: true },
    { name: 'texte', type: 'textarea', required: true },
    { name: 'date', type: 'date', required: true },
    { name: 'ordre', type: 'number', required: true },
    { name: 'categorie', type: 'text', label: 'Catégorie', required: true, admin: { description: 'Ex. Billetterie, Orateurs, Action sociale.' } },
    {
      name: 'icone',
      type: 'select',
      label: 'Icône',
      required: true,
      defaultValue: 'newspaper',
      options: [
        { label: 'Couronne', value: 'crown' },
        { label: 'Flamme', value: 'flame' },
        { label: 'Bâtiment', value: 'building' },
        { label: 'Calendrier', value: 'calendar' },
        { label: 'Personnes', value: 'people' },
        { label: 'Livre', value: 'book' },
        { label: 'Musique', value: 'music' },
        { label: 'Horloge', value: 'clock' },
        { label: 'Repère', value: 'pin' },
        { label: 'Lecture', value: 'play' },
        { label: 'Billet', value: 'ticket' },
        { label: 'Appareil photo', value: 'camera' },
        { label: 'Journal', value: 'newspaper' },
        { label: 'Cœur', value: 'heart' },
        { label: 'Wifi', value: 'wifi' },
        { label: 'Courrier', value: 'mail' },
        { label: 'Téléphone', value: 'phone' },
      ],
    },
    { name: 'lienHref', type: 'text', label: 'Lien (URL)', admin: { description: 'Ex. /billetterie — laisser vide si aucune page associée.' } },
    { name: 'lienLabel', type: 'text', label: 'Libellé du lien', admin: { description: 'Ex. "Voir la billetterie" — par défaut "En savoir plus".' } },
    { name: 'actif', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
  ],
};
