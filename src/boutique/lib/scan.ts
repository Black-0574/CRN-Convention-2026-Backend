/**
 * Contrôle d'accès (correction obligatoire n° 5) : le jeton du QR est authentifié (HMAC), le
 * titulaire retrouvé par l'empreinte, puis le droit de la plateforme est consommé par une
 * instruction conditionnelle unique — deux agents qui scannent le même billet au même instant ne
 * peuvent pas l'accepter tous les deux. Chaque scan, accepté ou refusé, est journalisé.
 */
import { empreinteJeton, jetonAuthentique, type ResultatScan } from '../domaine/src/index.ts';
import type { Payload } from 'payload';

import { lignes, maintenant, sql } from './db';

export interface ReponseScan {
  resultat: ResultatScan;
  message: string;
  titulaire?: { prenom: string; nom: string; numeroBillet: string; produit: string };
  dejaConsommeA?: string;
  dejaConsommePar?: string;
}

const heure = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville' });

export async function scanner(
  payload: Payload,
  entree: { jeton: string; plateformeCode: string; poste: string; agentId?: number },
): Promise<ReponseScan> {
  const { docs: plateformes } = await payload.find({ collection: 'plateformes', where: { code: { equals: entree.plateformeCode } }, limit: 1, depth: 0 });
  const plateforme = plateformes[0];
  if (!plateforme) throw new Error('Plateforme inconnue.');

  const journaliser = async (resultat: ResultatScan, titulaireId?: number) => {
    await payload.create({
      collection: 'scans',
      data: { plateforme: plateforme.id, ...(titulaireId ? { titulaire: titulaireId } : {}), resultat, poste: entree.poste, ...(entree.agentId ? { agent: entree.agentId } : {}) },
    });
  };

  const secret = process.env.BILLETS_SECRET ?? '';
  const jeton = entree.jeton.trim();
  if (!jetonAuthentique(jeton, secret)) {
    await journaliser('refuse_invalide');
    return { resultat: 'refuse_invalide', message: 'Billet invalide ou falsifié.' };
  }
  const { docs } = await payload.find({ collection: 'titulaires', where: { empreinteJeton: { equals: empreinteJeton(jeton) } }, limit: 1, depth: 1 });
  const t = docs[0];
  if (!t) {
    await journaliser('refuse_invalide');
    return { resultat: 'refuse_invalide', message: 'Billet inconnu (réémis ou annulé).' };
  }
  const titulaire = {
    prenom: t.prenom,
    nom: t.nom,
    numeroBillet: t.numeroBillet,
    produit: typeof t.produit === 'object' ? t.produit.nom : '',
  };

  const consomme = await lignes<{ id: number }>(
    payload,
    sql`UPDATE droits_acces SET statut = 'consomme', consomme_a = ${maintenant()}, poste = ${entree.poste}, updated_at = ${maintenant()}
        WHERE titulaire_id = ${t.id} AND plateforme_id = ${plateforme.id} AND statut = 'valide' RETURNING id`,
  );
  if (consomme.length > 0) {
    await journaliser('accepte', t.id);
    return { resultat: 'accepte', message: `Entrée acceptée — ${plateforme.nom}.`, titulaire };
  }

  const [droit] = await lignes<{ statut: string; consomme_a: string | null; poste: string | null }>(
    payload,
    sql`SELECT statut, consomme_a, poste FROM droits_acces WHERE titulaire_id = ${t.id} AND plateforme_id = ${plateforme.id}`,
  );
  if (!droit) {
    await journaliser('refuse_plateforme', t.id);
    return { resultat: 'refuse_plateforme', message: `Ce billet ne donne pas accès à : ${plateforme.nom}.`, titulaire };
  }
  if (droit.statut === 'annule') {
    await journaliser('refuse_annule', t.id);
    return { resultat: 'refuse_annule', message: 'Droit annulé (commande remboursée).', titulaire };
  }
  await journaliser('refuse_deja_utilise', t.id);
  return {
    resultat: 'refuse_deja_utilise',
    message: `Déjà utilisé${droit.consomme_a ? ` le ${heure.format(new Date(droit.consomme_a))}` : ''}${droit.poste ? ` (poste ${droit.poste})` : ''}.`,
    titulaire,
    ...(droit.consomme_a ? { dejaConsommeA: new Date(droit.consomme_a).toISOString() } : {}),
    ...(droit.poste ? { dejaConsommePar: droit.poste } : {}),
  };
}
