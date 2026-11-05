/**
 * Import initial du contenu du site (src/content/**, regroupé dans ./content.json par
 * scripts/export-seed-content.mjs) dans la base du back-office. Ne transfère que du contenu réel
 * déjà publié sur le site — rien n'est inventé.
 *
 * Lancé au démarrage (onInit, payload.config.ts) : nécessaire sur Hostinger, sans terminal.
 * - Ne s'exécute qu'une fois : marqueur `contenuInitialImporte` du global Settings.
 * - Reprise sans doublon après une interruption : chaque collection n'est importée que si elle
 *   est encore vide ; le marqueur n'est posé qu'à la toute fin.
 * - Photos : téléchargées depuis le site public, qui les sert déjà (le dossier d'exécution de
 *   Hostinger ne contient que les fichiers importés par l'application, pas public/).
 */
import type { CollectionSlug, Payload } from 'payload';

import content from './content.json';

type Entry<T> = { id: string; data: T };

interface SeedContent {
  settings: Entry<Record<string, unknown>>[];
  venues: Entry<{ nom: string; adresse: string; lienCarte?: string }>[];
  artists: Entry<{ nom: string; photo?: string }>[];
  faq: Entry<{ question: string; reponse: string; etats?: string[]; ordre: number }>[];
  products: Entry<Record<string, unknown>>[];
  announcements: Entry<{ titre: string; texte: string; date: string; ordre: number }>[];
  speakers: Entry<{ nom: string; fonction?: string; categorie: string; ordre?: number; bio?: string; photo?: string; videoInvitation?: string; datePublication?: string }>[];
  program: Entry<{
    date: string;
    label: string;
    ordre: number;
    sessions: {
      heureDebut: string;
      heureFin: string;
      titre: string;
      lieu: string;
      intervenants?: string[];
      noteIntervenant?: string;
      diffusion: string;
      visible?: boolean;
    }[];
  }>[];
}

// Reprend exactement le mapping de src/lib/announcements.ts (catégorie réelle déduite du sujet
// de chaque annonce — pas une donnée inventée).
const ANNOUNCEMENT_META: Record<string, { categorie: string; icone: string; lienHref?: string; lienLabel?: string }> = {
  'billetterie-ouverte': { categorie: 'Billetterie', icone: 'ticket', lienHref: '/billetterie', lienLabel: 'Voir la billetterie' },
  'revelation-orateurs': { categorie: 'Orateurs', icone: 'people', lienHref: '/orateurs', lienLabel: 'Voir les orateurs' },
  'collecte-action-sociale': { categorie: 'Action sociale', icone: 'heart', lienHref: '/action-sociale', lienLabel: 'En savoir plus' },
};

const ASSETS_BASE_URL = process.env.SEED_ASSETS_BASE_URL || 'https://www.crn-convention2026.events';

let running: Promise<boolean> | null = null;

export function seedFromContent(payload: Payload): Promise<boolean> {
  running ??= run(payload).finally(() => {
    running = null;
  });
  return running;
}

async function isEmpty(payload: Payload, collection: CollectionSlug): Promise<boolean> {
  const { totalDocs } = await payload.count({ collection });
  return totalDocs === 0;
}

async function uploadPhoto(payload: Payload, publicPath: string | undefined, alt: string): Promise<number | undefined> {
  if (!publicPath) return undefined;
  try {
    const res = await fetch(new URL(publicPath, ASSETS_BASE_URL));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const doc = await payload.create({
      collection: 'media',
      data: { alt },
      file: {
        data,
        mimetype: res.headers.get('content-type') || 'image/webp',
        name: publicPath.split('/').pop() || 'photo.webp',
        size: data.byteLength,
      },
    });
    return doc.id;
  } catch (err) {
    // Photo indisponible : la fiche est créée sans photo (cadre neutre sur le site).
    payload.logger.warn(`Import : photo ${publicPath} ignorée (${(err as Error).message})`);
    return undefined;
  }
}

async function run(payload: Payload): Promise<boolean> {
  const settings = await payload.findGlobal({ slug: 'settings' });
  if (settings.contenuInitialImporte) return false;

  const c = content as unknown as SeedContent;
  payload.logger.info('Import initial du contenu du site…');

  if (await isEmpty(payload, 'venues')) {
    for (const v of c.venues) await payload.create({ collection: 'venues', data: { ...v.data, actif: true } });
  }

  if (await isEmpty(payload, 'artists')) {
    for (const a of c.artists) {
      const photo = await uploadPhoto(payload, a.data.photo, a.data.nom);
      await payload.create({ collection: 'artists', data: { nom: a.data.nom, slug: a.id, photo, actif: true } });
    }
  }

  if (await isEmpty(payload, 'faq')) {
    for (const f of c.faq) await payload.create({ collection: 'faq', data: { ...f.data, actif: true } as never });
  }

  if (await isEmpty(payload, 'products')) {
    for (const p of c.products) await payload.create({ collection: 'products', data: p.data as never });
  }

  if (await isEmpty(payload, 'announcements')) {
    for (const an of c.announcements) {
      const meta = ANNOUNCEMENT_META[an.id] ?? { categorie: 'Convention', icone: 'newspaper' };
      await payload.create({ collection: 'announcements', data: { ...an.data, ...meta, actif: true } as never });
    }
  }

  if (await isEmpty(payload, 'speakers')) {
    for (const s of c.speakers) {
      const photo = await uploadPhoto(payload, s.data.photo, s.data.nom);
      await payload.create({
        collection: 'speakers',
        data: {
          nom: s.data.nom,
          fonction: s.data.fonction,
          slug: s.id,
          categorie: s.data.categorie as never,
          ordre: s.data.ordre,
          bio: s.data.bio,
          photo,
          videoInvitation: s.data.videoInvitation,
          datePublication: s.data.datePublication,
          actif: true,
        },
      });
    }
  }

  if (await isEmpty(payload, 'program-days')) {
    const { docs: speakers } = await payload.find({ collection: 'speakers', limit: 0, depth: 0 });
    const speakerIdBySlug = new Map(speakers.map((s) => [s.slug, s.id]));
    for (const day of c.program) {
      await payload.create({
        collection: 'program-days',
        data: {
          date: day.data.date,
          label: day.data.label,
          ordre: day.data.ordre,
          sessions: day.data.sessions.map((s) => ({
            heureDebut: s.heureDebut,
            heureFin: s.heureFin,
            titre: s.titre,
            lieu: s.lieu,
            intervenants: (s.intervenants ?? [])
              .map((slug) => speakerIdBySlug.get(slug))
              .filter((id): id is number => id !== undefined),
            noteIntervenant: s.noteIntervenant,
            diffusion: s.diffusion as never,
            visible: s.visible ?? true,
          })),
        },
      });
    }
  }

  await payload.updateGlobal({
    slug: 'settings',
    data: { ...(c.settings[0]?.data ?? {}), contenuInitialImporte: true } as never,
  });
  payload.logger.info('Import initial du contenu du site terminé.');
  return true;
}

/**
 * Biographies et fonctions des orateurs (document « Biographies des orateurs », 5 novembre 2026)
 * pour une base déjà importée : complète seulement les champs encore vides, à chaque démarrage,
 * sans jamais écraser une saisie faite dans l'admin. Orateur retrouvé par son identifiant
 * d'adresse (slug) ; absent ou renommé : ignoré.
 */
export async function completerProfilsOrateurs(payload: Payload): Promise<void> {
  const c = content as unknown as SeedContent;
  for (const s of c.speakers) {
    if (!s.data.bio && !s.data.fonction) continue;
    const doc = (await payload.find({ collection: 'speakers', where: { slug: { equals: s.id } }, limit: 1, depth: 0 })).docs[0];
    if (!doc) continue;
    const data: { bio?: string; fonction?: string } = {};
    if (s.data.bio && !doc.bio?.trim()) data.bio = s.data.bio;
    if (s.data.fonction && !doc.fonction?.trim()) data.fonction = s.data.fonction;
    if (Object.keys(data).length === 0) continue;
    await payload.update({ collection: 'speakers', id: doc.id, data });
    payload.logger.info(`Profil complété : ${doc.nom} (${Object.keys(data).join(', ')}).`);
  }
}

/** Photos remplacées à la demande du Commanditaire le 5 novembre 2026 (nouveaux fichiers « -2 »). */
const PHOTOS_REMPLACEES = new Set(['carelle-ambouroue', 'nadia-jocktane', 'jek-kalombo', 'robert-ondoa', 'silas-makangu']);

/**
 * Organisation des orateurs demandée le 5 novembre 2026, à chaque démarrage, sans jamais écraser
 * une saisie de l'admin :
 * - catégorie et ordre (nationaux puis internationaux, de gauche à droite) : une seule fois, pour
 *   les orateurs dont l'ordre est encore vide (colonne ajoutée par la migration
 *   20261105_203919_orateurs_ordre) ;
 * - photo : remplacée seulement si c'est encore la photo d'origine importée (« <identifiant>.webp ») ;
 *   téléchargée depuis le site public, donc retentée à chaque démarrage tant que le site qui la
 *   sert n'est pas en ligne.
 */
export async function organiserOrateurs(payload: Payload): Promise<void> {
  const c = content as unknown as SeedContent;
  for (const s of c.speakers) {
    if (s.data.ordre === undefined) continue;
    const doc = (await payload.find({ collection: 'speakers', where: { slug: { equals: s.id } }, limit: 1, depth: 1 })).docs[0];
    if (!doc) continue;
    const data: { ordre?: number; categorie?: never; photo?: number } = {};
    if (doc.ordre === null || doc.ordre === undefined) Object.assign(data, { ordre: s.data.ordre, categorie: s.data.categorie as never });
    const photoActuelle = typeof doc.photo === 'object' && doc.photo ? doc.photo.filename : null;
    if (PHOTOS_REMPLACEES.has(s.id) && photoActuelle === `${s.id}.webp`) {
      const photo = await uploadPhoto(payload, s.data.photo, s.data.nom);
      if (photo) data.photo = photo;
    }
    if (Object.keys(data).length === 0) continue;
    await payload.update({ collection: 'speakers', id: doc.id, data });
    payload.logger.info(`Orateur organisé : ${doc.nom} (${Object.keys(data).join(', ')}).`);
  }
}
