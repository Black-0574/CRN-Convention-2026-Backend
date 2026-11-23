import type { Payload } from 'payload';

/**
 * Programme et orateurs, corrections du Commanditaire du 23 novembre 2026, appliquées au démarrage sur une base
 * déjà importée, seulement sur l'ancienne valeur exacte (une saisie ultérieure n'est jamais
 * écrasée) :
 * - « Matin de gloire » : 6h–8h au lieu de 6h–7h30, les quatre matins (8, 9, 10 et 11 décembre,
 *   Matin de gloire spécial compris) ;
 * - Cérémonie d'ordination (13 décembre) : mention des responsables retirée ;
 * - Jek Kalombo : « Orateur national » au lieu de « Orateur international ».
 */
const RESPONSABLES_ORDINATION = 'Responsables : Alphonsine Ambouroué, Marie-Paule Asseh';

export async function appliquerCorrectionsDu23Novembre(payload: Payload): Promise<void> {
  let n = 0;
  for (const jour of (await payload.find({ collection: 'program-days', limit: 50, depth: 0, pagination: false })).docs) {
    let change = false;
    const sessions = (jour.sessions ?? []).map((s) => {
      if (s.titre?.startsWith('Matin de gloire') && s.heureDebut === '06:00' && s.heureFin === '07:30') {
        change = true;
        return { ...s, heureFin: '08:00' };
      }
      if (s.noteIntervenant === RESPONSABLES_ORDINATION) {
        change = true;
        return { ...s, noteIntervenant: null };
      }
      return s;
    });
    if (change) {
      await payload.update({ collection: 'program-days', id: jour.id, data: { sessions } });
      n++;
    }
  }
  for (const o of (await payload.find({ collection: 'speakers', where: { slug: { equals: 'jek-kalombo' } }, limit: 1, depth: 0 })).docs) {
    if (o.categorie !== 'international') continue;
    await payload.update({ collection: 'speakers', id: o.id, data: { categorie: 'national' } });
    n++;
  }
  if (n) payload.logger.info(`Corrections du 23 novembre appliquées (${n} fiche(s)) : Matin de gloire 6h–8h, responsables de l’ordination retirés, Jek Kalombo orateur national.`);
}
