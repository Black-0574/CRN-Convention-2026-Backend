/**
 * POST /api/candidatures — dépôt de candidature depuis la page Contact du site (13 novembre 2026) :
 * formulaire multipart (coordonnées, titre du poste, message, pièces jointes) envoyé par e-mail à
 * benevoles@crn-convention2026.events (`CANDIDATURES_A` pour une autre adresse), sujet
 * « DÉPÔT DE CANDIDATURE — <poste> — <candidat> », réponse adressée au candidat.
 *
 * Rien n'est conservé sur le serveur : les fichiers ne transitent qu'en mémoire jusqu'à l'envoi.
 * Garde-fous : taille et formats (regles.ts), champ piège anti-robot, consentement obligatoire,
 * 5 dépôts par heure et par adresse IP.
 */
import type { Endpoint, PayloadRequest } from 'payload';

import { gabarit, messagerie } from '../boutique/lib/messagerie';
import {
  DESTINATAIRE_CANDIDATURES,
  LIMITES,
  sujetCandidature,
  tailleLisible,
  verifierCandidature,
  verifierPieces,
  type Candidature,
} from './regles';

const json = (donnees: unknown, status = 200) => Response.json(donnees, { status, headers: { 'Cache-Control': 'no-store' } });
const erreur = (message: string, status = 400, details?: string[]) => json({ erreur: message, ...(details ? { details } : {}) }, status);

const echapper = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Limite de débit en mémoire (un seul processus Node sur l'hébergement).
const DEPOTS_PAR_HEURE = 5;
const depots = new Map<string, number[]>();

function limiteAtteinte(ip: string, maintenant = Date.now()): boolean {
  const recents = (depots.get(ip) ?? []).filter((t) => maintenant - t < 3_600_000);
  if (recents.length >= DEPOTS_PAR_HEURE) {
    depots.set(ip, recents);
    return true;
  }
  depots.set(ip, [...recents, maintenant]);
  return false;
}

const adresseIp = (req: PayloadRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'inconnue';

/** Référence courte pour retrouver le dépôt : CAND-20261113-7K4Q. */
const reference = () =>
  `CAND-${new Date(Date.now() + 3_600_000).toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

function corps(c: Candidature, ref: string, pieces: { nom: string; taille: number }[]): string {
  const ligne = (libelle: string, valeur: string) =>
    valeur ? `<tr><td style="padding:6px 12px 6px 0;color:#6B6B6B;vertical-align:top">${libelle}</td><td style="padding:6px 0;font-weight:700">${echapper(valeur)}</td></tr>` : '';
  return `<p style="margin:0 0 16px">Nouvelle candidature reçue depuis la page Contact du site de la Convention.</p>
<table style="border-collapse:collapse;margin:0 0 16px">
${ligne('Poste', c.poste)}${ligne('Candidat', `${c.prenom} ${c.nom}`.trim())}${ligne('E-mail', c.email)}${ligne('Téléphone', c.telephone)}${ligne('Référence', ref)}
</table>
<p style="margin:0 0 6px;color:#6B6B6B">Message</p>
<div style="margin:0 0 16px;padding:12px 16px;background:#F7F5F0;border-left:4px solid #B8963E;white-space:pre-wrap">${echapper(c.message)}</div>
<p style="margin:0 0 6px;color:#6B6B6B">Pièces jointes</p>
<p style="margin:0">${pieces.length ? pieces.map((p) => `${echapper(p.nom)} (${tailleLisible(p.taille)})`).join('<br>') : 'Aucune'}</p>
<p style="margin:16px 0 0;color:#6B6B6B">Répondre à cet e-mail écrit directement au candidat.</p>`;
}

export const endpoints: Endpoint[] = [
  {
    path: '/candidatures',
    method: 'post',
    handler: async (req) => {
      // Refus immédiat d'un envoi manifestement trop lourd, avant de lire le corps.
      const declare = Number(req.headers.get('content-length') ?? 0);
      if (declare > LIMITES.total + 1024 * 1024) return erreur(`Pièces jointes trop lourdes : ${tailleLisible(LIMITES.total)} au total au plus.`, 413);

      let form: FormData;
      try {
        form = await (req as unknown as Request).formData();
      } catch {
        return erreur('Formulaire illisible, veuillez réessayer.');
      }
      const texte = (n: string) => String(form.get(n) ?? '').trim();

      // Champ piège invisible pour un humain : un robot qui le remplit reçoit un faux succès.
      if (texte('site_web')) return json({ ok: true }, 201);
      if (texte('consentement') !== 'oui') return erreur('Merci d’accepter la transmission de votre candidature à l’équipe des bénévoles.');

      const candidature: Candidature = {
        prenom: texte('prenom'),
        nom: texte('nom'),
        email: texte('email'),
        telephone: texte('telephone'),
        poste: texte('poste'),
        message: texte('message'),
      };
      const fichiers = form.getAll('pieces').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f && (f as File).size > 0);
      const declarees = fichiers.map((f) => ({ nom: f.name, taille: f.size }));
      const erreurs = [...verifierCandidature(candidature), ...verifierPieces(declarees)];
      if (erreurs.length) return erreur(erreurs[0], 400, erreurs);
      if (limiteAtteinte(adresseIp(req))) return erreur('Trop de dépôts depuis cette connexion : réessayez dans une heure ou écrivez à benevoles@crn-convention2026.events.', 429);

      const ref = reference();
      try {
        await messagerie.envoyer({
          a: process.env.CANDIDATURES_A || DESTINATAIRE_CANDIDATURES,
          sujet: sujetCandidature(candidature),
          html: gabarit('Dépôt de candidature', corps(candidature, ref, declarees)),
          reference: ref,
          repondreA: candidature.email,
          pieces: await Promise.all(
            fichiers.map(async (f) => ({ nom: f.name.replace(/[\r\n"]/g, ' '), type: f.type || 'application/octet-stream', contenu: Buffer.from(await f.arrayBuffer()) })),
          ),
        });
      } catch (e) {
        req.payload.logger.error(`Candidature ${ref} non envoyée : ${(e as Error).message}`);
        return erreur('L’envoi n’a pas abouti. Réessayez dans quelques minutes ou écrivez à benevoles@crn-convention2026.events.', 502);
      }
      req.payload.logger.info(`Candidature ${ref} envoyée (${declarees.length} pièce(s)).`);
      return json({ ok: true, reference: ref }, 201);
    },
  },
];
