/**
 * Envoi des e-mails transactionnels derrière une interface : avec `SMTP_HOST`, `SMTP_USER` et
 * `SMTP_PASS`, envoi réel par SMTP depuis l'adresse de la boutique (boutique@crn-convention2026.events,
 * messagerie Hostinger du domaine) ; sinon (développement local), chaque e-mail est écrit dans
 * `.courriels/` (lisible dans un navigateur, rien n'est envoyé).
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import nodemailer from 'nodemailer';

import { CHEMIN_BANDEAU, urlBackOffice } from './urls';

export interface Courriel {
  a: string;
  sujet: string;
  html: string;
  /** Sert à classer les e-mails locaux par commande. */
  reference: string;
  /** Réponse adressée à une autre adresse que l'expéditeur (ex. le candidat). */
  repondreA?: string;
  pieces?: { nom: string; type: string; contenu: Buffer }[];
}

export interface Messagerie {
  envoyer(c: Courriel): Promise<void>;
}

export const DOSSIER_COURRIELS = process.env.COURRIELS_DIR || path.resolve(process.cwd(), '.courriels');

export class MessagerieLocale implements Messagerie {
  async envoyer(c: Courriel) {
    await mkdir(DOSSIER_COURRIELS, { recursive: true });
    const nom = `${c.reference}--${c.a.replace(/[^\w.@-]/g, '_')}--${Date.now()}.html`;
    const pieces = (c.pieces ?? []).map((p) => `${p.nom} (${p.type}, ${p.contenu.byteLength} o)`).join(' ; ');
    const entete = `<!-- À : ${c.a} | Sujet : ${c.sujet}${c.repondreA ? ` | Répondre à : ${c.repondreA}` : ''}${pieces ? ` | Pièces : ${pieces}` : ''} -->\n`;
    await writeFile(path.join(DOSSIER_COURRIELS, nom), entete + c.html, 'utf8');
    console.info(`[e-mail local] ${c.sujet} → ${c.a} (${nom})`);
  }
}

export async function courrielsDe(reference: string): Promise<string[]> {
  try {
    return (await readdir(DOSSIER_COURRIELS)).filter((f) => f.startsWith(`${reference}--`)).sort();
  } catch {
    return [];
  }
}

export const lireCourriel = (fichier: string) => readFile(path.join(DOSSIER_COURRIELS, path.basename(fichier)), 'utf8');

/** Adresse d'expédition des e-mails de la boutique aux clients (choisie par le CRN). */
export const EXPEDITEUR_BOUTIQUE = 'boutique@crn-convention2026.events';

export class MessagerieSmtp implements Messagerie {
  private readonly transport;
  private readonly expediteur: string;

  constructor(config: { hote: string; port?: number; utilisateur: string; motDePasse: string; expediteur?: string }) {
    const port = config.port ?? 465;
    this.expediteur = config.expediteur || `Convention CRN 2026 <${EXPEDITEUR_BOUTIQUE}>`;
    this.transport = nodemailer.createTransport({
      host: config.hote,
      port,
      secure: port === 465, // 465 : TLS d'emblée ; 587 : STARTTLS
      auth: { user: config.utilisateur, pass: config.motDePasse },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async envoyer(c: Courriel) {
    await this.transport.sendMail({
      from: this.expediteur,
      to: c.a,
      subject: c.sujet,
      html: c.html,
      ...(c.repondreA ? { replyTo: c.repondreA } : {}),
      ...(c.pieces?.length ? { attachments: c.pieces.map((p) => ({ filename: p.nom, contentType: p.type, content: p.contenu })) } : {}),
    });
    console.info(`[e-mail] ${c.sujet} → ${c.a}`);
  }

  /** Connexion et authentification au serveur SMTP, sans rien envoyer. */
  async verifier(): Promise<void> {
    await this.transport.verify();
  }
}

export function messagerieDepuisEnv(env: NodeJS.ProcessEnv = process.env): Messagerie {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    return new MessagerieSmtp({
      hote: env.SMTP_HOST,
      ...(env.SMTP_PORT ? { port: Number(env.SMTP_PORT) } : {}),
      utilisateur: env.SMTP_USER,
      motDePasse: env.SMTP_PASS,
      ...(env.COURRIEL_EXPEDITEUR ? { expediteur: env.COURRIEL_EXPEDITEUR } : {}),
    });
  }
  if (env.NODE_ENV === 'production') console.warn('[e-mail] SMTP non configuré (SMTP_HOST, SMTP_USER, SMTP_PASS) : e-mails écrits sur le serveur, rien n’est envoyé aux clients.');
  return new MessagerieLocale();
}

export const messagerie: Messagerie = messagerieDepuisEnv();

const echapper = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Gabarit sobre aux couleurs GBIS (bleu nuit, or, crème), bandeau officiel en tête (BQ-10) ; lisible sans images (texte de remplacement sur fond bleu nuit). */
export function gabarit(titre: string, corps: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)}</title></head>
<body style="margin:0;background:#F7F5F0;font-family:'Source Sans 3',Arial,sans-serif;color:#101010;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF">
<img src="${urlBackOffice()}${CHEMIN_BANDEAU}" width="560" height="187" alt="Convention CRN 2026" style="display:block;width:100%;height:auto;border:0;background:#16244A;color:#FFFFFF;font-family:'Source Serif 4',Georgia,serif;font-weight:700;font-size:20px">
<div style="background:#16244A;border-bottom:3px solid #B8963E;padding:12px 24px">
<div style="color:#D9C48A;font-size:16px">6 – 13 décembre 2026 · Libreville</div></div>
<div style="padding:24px">${corps}</div>
<div style="background:#F7F5F0;padding:16px 24px;color:#6B6B6B;font-size:14px">Ministères Christ Révélé aux Nations (CRN) · contact@crn-convention2026.events · +241 62 70 51 83</div>
</div></body></html>`;
}

export { echapper };
