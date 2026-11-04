/**
 * Livraison des articles achetés en ligne (articles officiels et kits des pass) :
 * - dans une église du réseau CRN, au Gabon ou hors du Gabon (liste du back-office) ;
 * - à domicile ou au lieu de travail, à Libreville, à titre exceptionnel (si le CRN l'active et en
 *   fixe les frais) ;
 * - au retrait sur le lieu de la Convention (si proposé).
 * Les pass et tickets eux-mêmes ne se livrent pas : ce sont des billets nominatifs à QR code.
 */
import type { Payload } from 'payload';

export type ModeLivraison = 'eglise' | 'domicile' | 'convention';

export const MODES_LIVRAISON: { label: string; value: ModeLivraison }[] = [
  { label: 'Église du réseau', value: 'eglise' },
  { label: 'Domicile ou lieu de travail (Libreville)', value: 'domicile' },
  { label: 'Retrait sur le lieu de la Convention', value: 'convention' },
];

export interface EgliseLivraison {
  id: number;
  nom: string;
  ville: string;
  pays: string;
  adresse: string | null;
  horaires: string | null;
  fraisXAF: number;
  delai: string | null;
}

export interface OptionsLivraison {
  eglises: EgliseLivraison[];
  domicile: { zone: string; fraisXAF: number; delai: string | null; conditions: string | null } | null;
  convention: { lieu: string | null; horaires: string | null } | null;
}

/** Modes réellement proposés au client (aucun mode sans données saisies par le CRN). */
export async function optionsLivraison(payload: Payload): Promise<OptionsLivraison> {
  const reglages = await payload.findGlobal({ slug: 'reglages-boutique' });
  const l = reglages.livraison;
  const { docs } = await payload.find({ collection: 'points-livraison', where: { actif: { equals: true } }, sort: ['pays', 'ordre', 'ville'], limit: 500, pagination: false, depth: 0 });
  const d = l?.domicile;
  return {
    eglises: docs.map((p) => ({
      id: p.id,
      nom: p.nom,
      ville: p.ville,
      pays: p.pays,
      adresse: p.adresse ?? null,
      horaires: p.horaires ?? null,
      fraisXAF: p.fraisXAF,
      delai: p.delai ?? null,
    })),
    domicile: d?.actif && typeof d.fraisXAF === 'number' ? { zone: d.zone || 'Libreville', fraisXAF: d.fraisXAF, delai: d.delai ?? null, conditions: d.conditions ?? null } : null,
    convention: l?.retraitConvention === false ? null : { lieu: l?.lieuRetrait || null, horaires: l?.horairesRetrait || null },
  };
}

export interface SaisieLivraison {
  mode?: string;
  pointId?: number;
  adresse?: string;
  telephone?: string;
  instructions?: string;
}

export interface LivraisonPreparee {
  mode: ModeLivraison;
  pointLivraison?: number;
  destination: string;
  adresse?: string;
  telephone?: string;
  instructions?: string;
  fraisXAF: number;
}

const texte = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const TELEPHONE = /^\+?[0-9 ().-]{8,20}$/;

/** Valide le mode choisi et en fixe les frais ; renvoie un message d'erreur lisible sinon. */
export function preparerLivraison(options: OptionsLivraison, saisie: SaisieLivraison | undefined): LivraisonPreparee | { erreur: string } {
  switch (saisie?.mode) {
    case 'eglise': {
      const e = options.eglises.find((x) => x.id === Number(saisie.pointId));
      if (!e) return { erreur: 'Choisissez l’église du réseau où recevoir vos articles.' };
      return { mode: 'eglise', pointLivraison: e.id, destination: `${e.nom} — ${e.ville}, ${e.pays}`, fraisXAF: e.fraisXAF };
    }
    case 'domicile': {
      const d = options.domicile;
      if (!d) return { erreur: 'La livraison à domicile n’est pas proposée pour le moment.' };
      const adresse = texte(saisie.adresse);
      const telephone = texte(saisie.telephone, 30);
      if (adresse.length < 8) return { erreur: `Indiquez l’adresse de livraison à ${d.zone} (quartier, rue, repère).` };
      if (!TELEPHONE.test(telephone)) return { erreur: 'Indiquez un numéro de téléphone joignable pour la livraison.' };
      const instructions = texte(saisie.instructions);
      return {
        mode: 'domicile',
        destination: `${d.zone} — ${adresse}`,
        adresse,
        telephone,
        ...(instructions ? { instructions } : {}),
        fraisXAF: d.fraisXAF,
      };
    }
    case 'convention': {
      const c = options.convention;
      if (!c) return { erreur: 'Le retrait sur le lieu de la Convention n’est pas proposé.' };
      return { mode: 'convention', destination: `Lieu de la Convention — ${c.lieu ?? 'lieu à annoncer'}`, fraisXAF: 0 };
    }
    default:
      return { erreur: 'Choisissez comment recevoir vos articles.' };
  }
}

/** Phrase destinée au client (e-mail, suivi) décrivant où et comment il recevra ses articles. */
export function texteLivraison(l: { mode?: string | null; destination?: string | null; telephone?: string | null }, horairesConvention?: string | null): string {
  switch (l.mode) {
    case 'eglise':
      return `Livraison à l’église du réseau : ${l.destination}. Nous vous prévenons dès que vos articles y sont disponibles.`;
    case 'domicile':
      return `Livraison à domicile ou au lieu de travail : ${l.destination}. Un agent de la COM Boutique vous appelle${l.telephone ? ` au ${l.telephone}` : ''} pour convenir du créneau.`;
    default:
      return `Retrait sur le lieu de la Convention : ${(l.destination ?? '').replace(/^Lieu de la Convention — /, '') || 'lieu à annoncer'}, ${horairesConvention || 'horaires à annoncer'}.`;
  }
}
