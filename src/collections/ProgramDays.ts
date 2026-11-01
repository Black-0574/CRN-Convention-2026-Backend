import type { CollectionConfig } from 'payload';

// Un document par jour, séances en tableau imbriqué (règle R5 : une saisie, affichage partout) —
// même forme que src/content/program/*.json côté site. "intervenants" devient une relation vers
// Speakers (au lieu de slugs texte) : sélection par liste déroulante, intégrité garantie.
export const ProgramDays: CollectionConfig = {
  slug: 'program-days',
  labels: { singular: 'Jour du programme', plural: 'Programme' },
  admin: { useAsTitle: 'label', defaultColumns: ['label', 'date', 'ordre'] },
  access: { read: () => true },
  defaultSort: 'ordre',
  fields: [
    { name: 'date', type: 'date', required: true },
    { name: 'label', type: 'text', required: true, admin: { description: 'Ex. "Lundi 7 décembre".' } },
    { name: 'ordre', type: 'number', required: true },
    {
      name: 'sessions',
      type: 'array',
      labels: { singular: 'Séance', plural: 'Séances' },
      fields: [
        { name: 'heureDebut', type: 'text', label: 'Heure de début', required: true, admin: { description: 'HH:mm' } },
        { name: 'heureFin', type: 'text', label: 'Heure de fin', required: true, admin: { description: 'HH:mm' } },
        { name: 'titre', type: 'text', required: true },
        { name: 'lieu', type: 'text', required: true },
        { name: 'intervenants', type: 'relationship', label: 'Intervenants', relationTo: 'speakers', hasMany: true },
        { name: 'noteIntervenant', type: 'text', label: 'Note sur l’intervenant', admin: { description: 'Ex. "Orateur à annoncer" quand non arrêté.' } },
        {
          name: 'diffusion',
          type: 'select',
          required: true,
          defaultValue: 'a_arbitrer',
          options: [
            { label: 'Direct', value: 'direct' },
            { label: 'Extraits', value: 'extraits' },
            { label: 'Différé', value: 'differe' },
            { label: 'Non diffusé', value: 'non_diffuse' },
            { label: 'À arbitrer', value: 'a_arbitrer' },
          ],
        },
        { name: 'visible', type: 'checkbox', defaultValue: true },
      ],
    },
  ],
};
