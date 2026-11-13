/**
 * Dépôt de candidature depuis la page Contact du site (demande du Commanditaire, 13 novembre 2026) :
 * règles partagées par le formulaire du site (contrôle avant envoi) et par le back-office (contrôle
 * qui fait foi). Module sans dépendance : importé tel quel des deux côtés.
 *
 * Pièces jointes envoyées par e-mail à benevoles@crn-convention2026.events : tailles plafonnées pour
 * rester sous la limite d'un e-mail de la messagerie du domaine (encodage base64 : +33 %) et rester
 * envoyables en 3G.
 */

export const SUJET_CANDIDATURE = 'DÉPÔT DE CANDIDATURE';
export const DESTINATAIRE_CANDIDATURES = 'benevoles@crn-convention2026.events';

const Mo = 1024 * 1024;

export const FAMILLES = {
  document: { libelle: 'Document', extensions: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt'], max: 5 * Mo },
  image: { libelle: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'], max: 5 * Mo },
  audio: { libelle: 'Audio', extensions: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus'], max: 10 * Mo },
  video: { libelle: 'Vidéo', extensions: ['mp4', 'mov', 'webm', '3gp'], max: 15 * Mo },
} as const;

export type Famille = keyof typeof FAMILLES;

export const LIMITES = { fichiers: 5, total: 20 * Mo, poste: 120, message: 5000, nom: 80 } as const;

/** Liste « accept » du champ fichier du formulaire. */
export const ACCEPT = Object.values(FAMILLES)
  .flatMap((f) => f.extensions.map((e) => `.${e}`))
  .join(',');

export const extension = (nom: string) => (nom.includes('.') ? nom.split('.').pop()!.toLowerCase() : '');

export const familleDe = (nom: string): Famille | undefined =>
  (Object.keys(FAMILLES) as Famille[]).find((f) => (FAMILLES[f].extensions as readonly string[]).includes(extension(nom)));

/** 1 048 576 → « 1 Mo » ; 350 000 → « 342 Ko » (espace fine insécable avant l'unité). */
export const tailleLisible = (octets: number) =>
  octets >= Mo ? `${(octets / Mo).toFixed(octets >= 10 * Mo ? 0 : 1).replace('.', ',').replace(/,0$/, '')} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;

export interface PieceDeclaree {
  nom: string;
  taille: number;
}

/** Erreurs lisibles par le candidat (vide = pièces acceptées). */
export function verifierPieces(pieces: PieceDeclaree[]): string[] {
  const erreurs: string[] = [];
  if (pieces.length > LIMITES.fichiers) erreurs.push(`${LIMITES.fichiers} fichiers au plus (${pieces.length} choisis).`);
  for (const p of pieces) {
    const f = familleDe(p.nom);
    if (!f) erreurs.push(`« ${p.nom} » : format non accepté (documents Word ou PDF, images, audio ou vidéo).`);
    else if (p.taille > FAMILLES[f].max) erreurs.push(`« ${p.nom} » : ${tailleLisible(p.taille)}, au-delà de ${tailleLisible(FAMILLES[f].max)} pour un fichier ${FAMILLES[f].libelle.toLowerCase()}.`);
    else if (p.taille === 0) erreurs.push(`« ${p.nom} » : fichier vide.`);
  }
  const total = pieces.reduce((s, p) => s + p.taille, 0);
  if (total > LIMITES.total) erreurs.push(`Pièces jointes : ${tailleLisible(total)} au total, au-delà de ${tailleLisible(LIMITES.total)}.`);
  return erreurs;
}

export interface Candidature {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  poste: string;
  message: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function verifierCandidature(c: Candidature): string[] {
  const erreurs: string[] = [];
  if (!c.prenom.trim()) erreurs.push('Le prénom est obligatoire.');
  if (!EMAIL.test(c.email.trim())) erreurs.push('L’adresse e-mail n’est pas valide.');
  if (!c.poste.trim()) erreurs.push('Le titre du poste est obligatoire.');
  if (c.poste.length > LIMITES.poste) erreurs.push(`Le titre du poste dépasse ${LIMITES.poste} caractères.`);
  if (!c.message.trim()) erreurs.push('Le message est obligatoire.');
  if (c.message.length > LIMITES.message) erreurs.push(`Le message dépasse ${LIMITES.message} caractères.`);
  if (c.prenom.length > LIMITES.nom || c.nom.length > LIMITES.nom) erreurs.push(`Le prénom et le nom ne dépassent pas ${LIMITES.nom} caractères.`);
  return erreurs;
}

/** « DÉPÔT DE CANDIDATURE — Agent d'accueil — Awa Mba » (sans retour à la ligne : en-tête d'e-mail). */
export const sujetCandidature = (c: Pick<Candidature, 'poste' | 'prenom' | 'nom'>) =>
  `${SUJET_CANDIDATURE} — ${c.poste} — ${`${c.prenom} ${c.nom}`.trim()}`.replace(/[\r\n]+/g, ' ').slice(0, 200);
