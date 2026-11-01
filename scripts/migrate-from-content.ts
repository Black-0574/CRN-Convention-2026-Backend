/**
 * Migration unique du contenu existant (site/src/content/**) vers la base du back-office via
 * l'API locale de Payload. Ne transfère que du contenu réel déjà présent dans le dépôt — rien
 * n'est inventé. Exécution : npm run migrate-from-content (depuis backend/), une fois le
 * back-office démarré (`docker compose up` ou `npm run dev`).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPayload } from 'payload';

import config from '../payload.config';

const dirname = path.dirname(fileURLToPath(import.meta.url));
// Le site Astro vit à la racine du dépôt (frère de backend/), pas dans un sous-dossier séparé.
const siteRoot = path.resolve(dirname, '../..');
const contentRoot = path.join(siteRoot, 'src/content');
const publicRoot = path.join(siteRoot, 'public');

// Reprend exactement le mapping de site/src/lib/announcements.ts (catégorie réelle déduite du
// sujet de chaque annonce — pas une donnée inventée).
const ANNOUNCEMENT_META: Record<string, { categorie: string; icone: string; lienHref?: string; lienLabel?: string }> = {
  'billetterie-ouverte': { categorie: 'Billetterie', icone: 'ticket', lienHref: '/billetterie', lienLabel: 'Voir la billetterie' },
  'revelation-orateurs': { categorie: 'Orateurs', icone: 'people', lienHref: '/orateurs', lienLabel: 'Voir les orateurs' },
  'collecte-action-sociale': { categorie: 'Action sociale', icone: 'heart', lienHref: '/action-sociale', lienLabel: 'En savoir plus' },
};

async function readJsonDir<T>(dir: string): Promise<{ id: string; data: T }[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const entries = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => ({
        id: path.basename(f, '.json'),
        data: JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as T,
      })),
  );
  return entries;
}

async function uploadMediaFromPublicPath(payload: Awaited<ReturnType<typeof getPayload>>, publicPath?: string) {
  if (!publicPath) return undefined;
  const absolute = path.join(publicRoot, publicPath.replace(/^\//, ''));
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(absolute);
  } catch {
    console.warn(`  ⚠ photo introuvable, ignorée : ${publicPath}`);
    return undefined;
  }
  const doc = await payload.create({
    collection: 'media',
    data: { alt: '' },
    file: {
      data: buffer,
      mimetype: 'image/webp',
      name: path.basename(absolute),
      size: buffer.byteLength,
    },
  });
  return doc.id;
}

async function run() {
  const payload = await getPayload({ config });
  console.log('— Migration du contenu existant vers PostgreSQL —');

  // Settings (global, document unique)
  const settingsFiles = await readJsonDir<Record<string, unknown>>(path.join(contentRoot, 'settings'));
  if (settingsFiles[0]) {
    await payload.updateGlobal({ slug: 'settings', data: settingsFiles[0].data as never });
    console.log('✓ settings');
  }

  // Venues
  const venues = await readJsonDir<{ nom: string; adresse: string; lienCarte?: string }>(path.join(contentRoot, 'venues'));
  for (const v of venues) {
    await payload.create({ collection: 'venues', data: { ...v.data, actif: true } });
  }
  console.log(`✓ venues (${venues.length})`);

  // Artists
  const artists = await readJsonDir<{ nom: string; photo?: string }>(path.join(contentRoot, 'artists'));
  for (const a of artists) {
    const photo = await uploadMediaFromPublicPath(payload, a.data.photo);
    await payload.create({ collection: 'artists', data: { nom: a.data.nom, photo, actif: true } });
  }
  console.log(`✓ artists (${artists.length})`);

  // Faq
  const faqs = await readJsonDir<{ question: string; reponse: string; etats: string[]; ordre: number }>(path.join(contentRoot, 'faq'));
  for (const f of faqs) {
    await payload.create({ collection: 'faq', data: { ...f.data, actif: true } as never });
  }
  console.log(`✓ faq (${faqs.length})`);

  // Products
  const products = await readJsonDir<Record<string, unknown>>(path.join(contentRoot, 'products'));
  for (const p of products) {
    await payload.create({ collection: 'products', data: p.data as never });
  }
  console.log(`✓ products (${products.length})`);

  // Announcements
  const announcements = await readJsonDir<{ titre: string; texte: string; date: string; ordre: number }>(path.join(contentRoot, 'announcements'));
  for (const an of announcements) {
    const meta = ANNOUNCEMENT_META[an.id] ?? { categorie: 'Convention', icone: 'newspaper' };
    await payload.create({ collection: 'announcements', data: { ...an.data, ...meta, actif: true } as never });
  }
  console.log(`✓ announcements (${announcements.length})`);

  // Speakers — on garde une table slug -> id Payload pour les relations du programme ensuite.
  const speakers = await readJsonDir<{ nom: string; categorie: string; bio?: string; photo?: string; videoInvitation?: string; datePublication?: string }>(
    path.join(contentRoot, 'speakers'),
  );
  const speakerIdBySlug = new Map<string, number>();
  for (const s of speakers) {
    const photo = await uploadMediaFromPublicPath(payload, s.data.photo);
    const doc = await payload.create({
      collection: 'speakers',
      data: {
        nom: s.data.nom,
        categorie: s.data.categorie as never,
        bio: s.data.bio,
        photo,
        videoInvitation: s.data.videoInvitation,
        datePublication: s.data.datePublication,
        actif: true,
      },
    });
    speakerIdBySlug.set(s.id, doc.id);
  }
  console.log(`✓ speakers (${speakers.length})`);

  // Program days (séances imbriquées, intervenants résolus en relations vers speakers)
  interface SessionJson {
    heureDebut: string;
    heureFin: string;
    titre: string;
    lieu: string;
    intervenants?: string[];
    noteIntervenant?: string;
    diffusion: string;
    visible?: boolean;
  }
  const programDays = await readJsonDir<{ date: string; label: string; ordre: number; sessions: SessionJson[] }>(
    path.join(contentRoot, 'program'),
  );
  for (const day of programDays) {
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
  console.log(`✓ program-days (${programDays.length})`);

  console.log('— Migration terminée —');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
