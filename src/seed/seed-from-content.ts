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
  speakers: Entry<{ nom: string; categorie: string; bio?: string; photo?: string; videoInvitation?: string; datePublication?: string }>[];
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
      await payload.create({ collection: 'artists', data: { nom: a.data.nom, photo, actif: true } });
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
          slug: s.id,
          categorie: s.data.categorie as never,
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
