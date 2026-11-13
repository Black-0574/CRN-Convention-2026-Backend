import type { Payload } from 'payload';

import { publierAnnonceUneFois, typo } from './annonces';

/**
 * Changement de lieu du dimanche 13 décembre (Commanditaire, 11 novembre 2026) : les activités
 * ne se tiennent plus au Nomad ; le nouveau lieu sera annoncé. Appliqué au démarrage sur une base
 * déjà importée :
 * - « Nomad » devient « Lieu à déterminer » dans le programme, la FAQ, les lieux, les fiches
 *   Billetterie du site, les produits et les séances de la boutique (billets, contrôle d'accès) ;
 * - le communiqué est publié dans les Actualités, avec son visuel (public/actualites/).
 * Seules les anciennes valeurs exactes sont remplacées et le communiqué n'est créé qu'une fois :
 * une saisie ultérieure dans l'admin n'est jamais écrasée.
 */
export const LIEU_A_DETERMINER = 'Lieu à déterminer';

/** Ancienne mention du Nomad → nouvelle formulation ; null si le texte ne contient pas l'ancienne valeur. */
export function sansNomad(t?: string | null): string | null {
  if (!t || !t.includes('Nomad')) return null;
  if (t === 'Nomad') return LIEU_A_DETERMINER;
  const n = t
    .replace('se conclut au Nomad', 'se conclut dans un lieu à déterminer')
    .replace(/, Nomad\./g, ', lieu à déterminer.')
    .replace(/— Nomad$/, `— ${LIEU_A_DETERMINER}`);
  return n === t ? null : n;
}

export const SLUG_COMMUNIQUE = 'changement-lieu-13-decembre';
const VISUEL = 'changement-lieu-13-decembre.webp';

export const COMMUNIQUE = {
  titre: typo('Convention CRN 2026 : changement de lieu pour les activités du dimanche 13 décembre'),
  texte: typo('Les activités du dimanche 13 décembre 2026 ne se tiendront plus au Nomad. Le rendez-vous est maintenu : seul le lieu reste à confirmer, il sera annoncé prochainement.'),
  date: '2026-11-11',
  categorie: 'Communiqué',
  icone: 'pin',
  imageAlt: typo('Communiqué important : changement de lieu du programme du dimanche 13 décembre 2026. Les activités ne se tiendront plus au Nomad ; le nouveau lieu sera annoncé prochainement. Le rendez-vous du 13 décembre est maintenu.'),
  article: [
    'Le Comité d’organisation de la Convention CRN 2026 informe les conventionnaires, les membres des Ministères Christ Révélé aux Nations (CRN), au Gabon et dans la diaspora, d’une modification concernant le lieu des activités prévues le dimanche 13 décembre 2026.',
    'Initialement programmées au Nomad, les activités de cette dernière journée de la Convention se dérouleront dans un autre cadre, dont la localisation sera communiquée prochainement.',
    '## Le rendez-vous du 13 décembre est maintenu',
    'Le Comité d’organisation tient à rassurer l’ensemble des participants : la date du dimanche 13 décembre 2026 reste inchangée. Seul le lieu de déroulement des activités est en cours de confirmation.',
    'Cette journée constitue un temps fort de la Convention CRN 2026, organisée du 6 au 13 décembre 2026 à Libreville, autour du thème :',
    '> « Du Trône à l’autel, de l’autel à la cité. »',
    '## Restez connectés aux canaux officiels',
    'Les informations relatives au nouveau lieu, aux horaires et aux modalités pratiques de participation seront diffusées en temps opportun sur le site officiel de la Convention et les plateformes de communication des Ministères CRN.',
    'Le Comité d’organisation invite tous les conventionnaires à suivre régulièrement ces canaux afin de préparer leur participation dans les meilleures conditions.',
    'Pour toutes les informations et actualités de la Convention : https://crn-convention2026.events',
  ]
    .map(typo)
    .join('\n\n'),
};

export async function appliquerLieuDu13Decembre(payload: Payload): Promise<void> {
  let n = 0;
  const majTextes = async (collection: 'faq' | 'products' | 'produits' | 'venues' | 'plateformes', champs: string[]) => {
    for (const doc of (await payload.find({ collection, limit: 500, depth: 0, pagination: false })).docs as unknown as Record<string, unknown>[]) {
      const data: Record<string, string> = {};
      for (const c of champs) {
        const v = sansNomad(doc[c] as string | null | undefined);
        if (v) data[c] = v;
      }
      if (collection === 'venues' && data.nom && doc.adresse === 'Libreville, Gabon') data.adresse = 'À annoncer';
      if (Object.keys(data).length) {
        await payload.update({ collection, id: doc.id as number, data: data as never });
        n++;
      }
    }
  };
  // Programme du jour, repéré par sa date ou son libellé (date enregistrée avec ou sans décalage).
  const jour = (await payload.find({ collection: 'program-days', limit: 50, depth: 0, pagination: false })).docs.find(
    (d) => String(d.date).startsWith('2026-12-13') || String(d.date).startsWith('2026-12-12T23') || /13 décembre/.test(d.label),
  );
  if (jour) {
    const label = sansNomad(jour.label);
    let change = Boolean(label);
    const sessions = (jour.sessions ?? []).map((s) => {
      const lieu = sansNomad(s.lieu);
      if (!lieu) return s;
      change = true;
      return { ...s, lieu };
    });
    if (change) {
      await payload.update({ collection: 'program-days', id: jour.id, data: { ...(label ? { label } : {}), sessions } });
      n++;
    }
  }
  await majTextes('faq', ['reponse']);
  await majTextes('venues', ['nom']);
  await majTextes('products', ['description']);
  await majTextes('produits', ['resume', 'description']);
  await majTextes('plateformes', ['lieu']);
  if (n) payload.logger.info(`Lieu du 13 décembre : « ${LIEU_A_DETERMINER} » (${n} fiche(s) mises à jour).`);
  await publierAnnonceUneFois(payload, { ...COMMUNIQUE, slug: SLUG_COMMUNIQUE, visuel: VISUEL });
}
