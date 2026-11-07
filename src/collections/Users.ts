import { APIError, type Access, type CollectionConfig, type FieldAccess } from 'payload';

import { CELLULE_LIBREVILLE, dateHeure } from '../boutique/collections/dates';
import { ROLES } from '../boutique/lib/acces';
import { journaliser } from '../boutique/lib/journal';

// Comptes nominatifs + rôles (admin / éditeur, et les rôles de la boutique) — exigence explicite du Commanditaire pour le
// back-office (lot L3). Profils enrichis (7 novembre 2026) : identité, photo, organisation, statut
// du compte, dernière connexion, affectation de contrôle d'accès, notes internes.

type Moi = { id?: number | string; role?: string } | null | undefined;

const estAdmin = (user: Moi) => user?.role === 'admin';

/** L'administrateur voit tous les comptes ; chacun voit et modifie sa propre fiche. */
const soiOuAdmin: Access = ({ req: { user } }) => (estAdmin(user as Moi) ? true : user ? { id: { equals: user.id } } : false);
const adminSeulement: FieldAccess = ({ req: { user } }) => estAdmin(user as Moi);

export const SERVICES = [
  { label: 'Direction', value: 'direction' },
  { label: 'Communication', value: 'communication' },
  { label: 'Boutique', value: 'boutique' },
  { label: 'COM Boutique (accueil et contrôle)', value: 'com_boutique' },
  { label: 'Comptabilité', value: 'comptabilite' },
  { label: 'Technique', value: 'technique' },
  { label: 'Autre', value: 'autre' },
];

const nomAffiche = (prenom?: string | null, nom?: string | null) => [prenom, nom].map((x) => x?.trim()).filter(Boolean).join(' ');

export const Users: CollectionConfig = journaliser({
  slug: 'users',
  labels: { singular: 'Utilisateur', plural: 'Utilisateurs' },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
  },
  admin: {
    useAsTitle: 'nomAffiche',
    defaultColumns: ['nomAffiche', 'email', 'role', 'service', 'statut', 'derniereConnexion'],
    group: 'Administration',
    description: 'Comptes nominatifs de l’équipe. Un compte suspendu ne peut plus se connecter, ni au back-office ni au contrôle d’accès.',
  },
  access: {
    read: soiOuAdmin,
    create: ({ req: { user } }) => estAdmin(user as Moi),
    update: soiOuAdmin,
    delete: ({ req: { user } }) => estAdmin(user as Moi),
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, req }) => {
        const avant = (originalDoc ?? {}) as { id?: number; role?: string; statut?: string; prenom?: string; nom?: string };
        // Garde-fous : un administrateur ne se suspend pas et ne se retire pas son propre rôle.
        if (req.user && avant.id !== undefined && req.user.id === avant.id) {
          if (data.statut === 'suspendu') throw new APIError('Vous ne pouvez pas suspendre votre propre compte.', 400, undefined, true);
          if (avant.role === 'admin' && data.role && data.role !== 'admin') {
            throw new APIError('Vous ne pouvez pas retirer votre propre rôle d’administrateur.', 400, undefined, true);
          }
        }
        data.nomAffiche = nomAffiche(data.prenom ?? avant.prenom, data.nom ?? avant.nom);
        return data;
      },
    ],
    beforeLogin: [
      ({ user }) => {
        if ((user as { statut?: string }).statut === 'suspendu') {
          throw new APIError('Ce compte est suspendu. Contactez un administrateur du back-office.', 403, undefined, true);
        }
        return user;
      },
    ],
    afterLogin: [
      async ({ req, user }) => {
        await req.payload.update({ collection: 'users', id: user.id, data: { derniereConnexion: new Date().toISOString() }, overrideAccess: true, req });
        return user;
      },
    ],
  },
  fields: [
    {
      name: 'nomAffiche',
      type: 'text',
      label: 'Nom',
      admin: { hidden: true },
      // Jamais vide à l'affichage : recalculé à la lecture s'il manque (comptes antérieurs).
      hooks: { afterRead: [({ value, siblingData }) => value || nomAffiche(siblingData.prenom, siblingData.nom) || siblingData.email] },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Identité',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'prenom', type: 'text', label: 'Prénom', admin: { width: '50%' } },
                { name: 'nom', type: 'text', label: 'Nom', required: true, admin: { width: '50%' } },
              ],
            },
            {
              name: 'photo',
              type: 'upload',
              relationTo: 'photos-profil',
              label: 'Photo de profil',
              admin: { description: 'Visible des seuls comptes du back-office. Sans photo, les initiales s’affichent.' },
            },
            { name: 'telephone', type: 'text', label: 'Téléphone', admin: { description: 'Ex. +241 62 70 51 83.' } },
          ],
        },
        {
          label: 'Organisation',
          fields: [
            { name: 'fonction', type: 'text', label: 'Fonction', admin: { description: 'Intitulé du poste (ex. Responsable de la COM Boutique).' } },
            {
              type: 'row',
              fields: [
                { name: 'service', type: 'select', label: 'Service', options: SERVICES, access: { update: adminSeulement }, admin: { width: '50%' } },
                {
                  name: 'role',
                  type: 'select',
                  label: 'Rôle',
                  required: true,
                  defaultValue: 'editeur',
                  options: [...ROLES],
                  access: { update: adminSeulement },
                  admin: { width: '50%', description: 'Détermine les rubriques visibles et modifiables.' },
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'Contrôle d’accès (COM Boutique)',
              admin: { description: 'Séance et poste proposés d’office sur la page de scan après connexion.' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'seanceScan', type: 'relationship', relationTo: 'plateformes', label: 'Séance par défaut', admin: { width: '50%' } },
                    { name: 'posteScan', type: 'text', label: 'Poste par défaut', admin: { width: '50%', placeholder: 'ex. Église Centrale — porte 1' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Accès et sécurité',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'statut',
                  type: 'select',
                  label: 'Statut du compte',
                  required: true,
                  defaultValue: 'actif',
                  options: [
                    { label: 'Actif', value: 'actif' },
                    { label: 'Suspendu', value: 'suspendu' },
                  ],
                  access: { update: adminSeulement },
                  admin: { width: '50%' },
                },
                dateHeure('derniereConnexion', 'Dernière connexion', {
                  access: { update: () => false },
                  admin: { width: '50%', readOnly: true, date: { pickerAppearance: 'dayAndTime' }, components: CELLULE_LIBREVILLE },
                } as never),
              ],
            },
            {
              name: 'notesInternes',
              type: 'textarea',
              label: 'Notes internes',
              access: { read: adminSeulement, update: adminSeulement },
              admin: { description: 'Visibles des seuls administrateurs (missions, disponibilités, consignes).' },
            },
          ],
        },
      ],
    },
  ],
});
