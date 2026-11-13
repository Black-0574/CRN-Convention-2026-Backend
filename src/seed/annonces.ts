import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Payload } from 'payload';

/**
 * Publication d'une actualité au démarrage du back-office, une seule fois (repérée par son adresse),
 * avec son visuel livré dans public/actualites/ (déployé avec l'application) : communiqué du
 * 13 décembre (11 novembre 2026), appel à candidatures médias (13 novembre 2026). Une annonce déjà
 * créée n'est jamais modifiée : les retouches se font ensuite dans l'admin.
 */

// Typographie française : espace insécable avant « : ; ! ? » et à l'intérieur des guillemets.
export const typo = (t: string) => t.replace(/ ([:;!?»])/g, ' $1').replace(/« /g, '« ');

export interface AnnonceAPublier {
  slug: string;
  titre: string;
  texte: string;
  date: string;
  categorie: string;
  icone: string;
  article: string;
  /** Fichier de public/actualites/ (WebP). */
  visuel: string;
  imageAlt: string;
}

export async function publierAnnonceUneFois(payload: Payload, a: AnnonceAPublier): Promise<boolean> {
  const existe = await payload.count({ collection: 'announcements', where: { slug: { equals: a.slug } } });
  if (existe.totalDocs) return false;
  let image: number | undefined;
  try {
    const data = await readFile(path.join(process.cwd(), 'public', 'actualites', a.visuel));
    const media = await payload.create({
      collection: 'media',
      data: { alt: a.imageAlt },
      file: { data, mimetype: 'image/webp', name: a.visuel, size: data.byteLength },
    });
    image = media.id as number;
  } catch (err) {
    payload.logger.warn(`Actualité « ${a.slug} » : visuel non importé (${(err as Error).message}).`);
  }
  // En tête des actualités : avant la plus petite valeur d'ordre existante.
  const premier = (await payload.find({ collection: 'announcements', sort: 'ordre', limit: 1, depth: 0 })).docs[0];
  const { visuel: _visuel, imageAlt: _alt, ...champs } = a;
  await payload.create({
    collection: 'announcements',
    data: { ...champs, ordre: premier ? Number(premier.ordre) - 1 : 0, image, actif: true } as never,
  });
  payload.logger.info(`Actualité « ${a.titre} » publiée.`);
  return true;
}
