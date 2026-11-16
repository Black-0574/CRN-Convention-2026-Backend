import type { Payload } from 'payload';

/**
 * Nom de la plateforme du samedi 12 décembre (Commanditaire, 16 novembre 2026) : « Femme de Foi »
 * devient « Femme 2 Fois » partout (« Femme 2 Fois — Live »). Appliqué au démarrage sur une base
 * déjà importée : programme, FAQ, actualités, fiches Billetterie du site, produits et séances de la
 * boutique. L'identifiant d'adresse (femme-de-foi-live) est conservé : liens et billets restent
 * valides. Les commandes et billets déjà émis gardent le libellé de leur achat.
 * Seule l'ancienne valeur exacte est remplacée : une saisie ultérieure n'est jamais écrasée.
 */
export const ANCIEN_NOM = 'Femme de Foi';
export const NOUVEAU_NOM = 'Femme 2 Fois';

/** Texte avec le nouveau nom ; null s'il ne contient pas l'ancien. */
export function avecFemme2Fois(t?: string | null): string | null {
  if (!t || !t.includes(ANCIEN_NOM)) return null;
  return t.replaceAll(ANCIEN_NOM, NOUVEAU_NOM);
}

type Collection = 'faq' | 'announcements' | 'products' | 'produits' | 'plateformes' | 'quotas' | 'variantes';

export async function appliquerNomFemme2Fois(payload: Payload): Promise<void> {
  let n = 0;
  const majTextes = async (collection: Collection, champs: string[]) => {
    for (const doc of (await payload.find({ collection, limit: 500, depth: 0, pagination: false })).docs as unknown as Record<string, unknown>[]) {
      const data: Record<string, string> = {};
      for (const c of champs) {
        const v = avecFemme2Fois(doc[c] as string | null | undefined);
        if (v) data[c] = v;
      }
      if (Object.keys(data).length) {
        await payload.update({ collection, id: doc.id as number, data: data as never });
        n++;
      }
    }
  };
  for (const jour of (await payload.find({ collection: 'program-days', limit: 50, depth: 0, pagination: false })).docs) {
    let change = false;
    const sessions = (jour.sessions ?? []).map((s) => {
      const titre = avecFemme2Fois(s.titre);
      if (!titre) return s;
      change = true;
      return { ...s, titre };
    });
    if (change) {
      await payload.update({ collection: 'program-days', id: jour.id, data: { sessions } });
      n++;
    }
  }
  await majTextes('faq', ['question', 'reponse']);
  await majTextes('announcements', ['titre', 'texte', 'article']);
  await majTextes('products', ['nom', 'description']);
  await majTextes('produits', ['nom', 'resume', 'description']);
  await majTextes('plateformes', ['nom']);
  await majTextes('quotas', ['nom']);
  await majTextes('variantes', ['libelle']);
  if (n) payload.logger.info(`Nom de plateforme : « ${NOUVEAU_NOM} » (${n} fiche(s) mises à jour).`);
}
