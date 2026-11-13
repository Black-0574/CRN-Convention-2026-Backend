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
    { name: 'texte', type: 'textarea', required: true, label: 'Résumé (carte)', admin: { description: 'Deux ou trois phrases, affichées sur la carte de l’actualité.' } },
    // Article complet et visuel (demande du 11 novembre 2026, communiqué du changement de lieu du
    // 13 décembre) : une page /actualites/<adresse> est publiée dès que l'article est rempli.
    {
      name: 'article',
      type: 'textarea',
      label: 'Article complet',
      admin: {
        rows: 14,
        description: 'Facultatif. Un paragraphe par bloc, séparés par une ligne vide. En début de bloc : « ## » intertitre, « ### » sous-titre, « > » citation, « - » à chaque ligne = liste à puces ; un bloc « [Texte](/lien) » seul = bouton. Rempli : la carte mène à la page de l’article.',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      label: 'Visuel (vignette)',
      admin: { description: 'Facultatif. Vignette de la carte (recadrée en 16:9) et visuel entier en tête de l’article. Renseigner le texte alternatif du média.' },
    },
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
    {
      name: 'slug',
      type: 'text',
      label: 'Adresse de l’article',
      unique: true,
      index: true,
      admin: { position: 'sidebar', description: 'Ex. changement-lieu-13-decembre → /actualites/changement-lieu-13-decembre. Vide : numéro de l’annonce.' },
    },
  ],
};
