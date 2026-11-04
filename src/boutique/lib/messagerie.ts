/**
 * Envoi des e-mails transactionnels derrière une interface : en local, chaque e-mail est écrit
 * dans `.courriels/` (lisible dans un navigateur, rien n'est envoyé) ; en production, un
 * prestataire d'envoi (à choisir par le CRN, question bloquante n° 7) implémentera `Messagerie`.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface Courriel {
  a: string;
  sujet: string;
  html: string;
  /** Sert à classer les e-mails locaux par commande. */
  reference: string;
}

export interface Messagerie {
  envoyer(c: Courriel): Promise<void>;
}

export const DOSSIER_COURRIELS = process.env.COURRIELS_DIR || path.resolve(process.cwd(), '.courriels');

export class MessagerieLocale implements Messagerie {
  async envoyer(c: Courriel) {
    await mkdir(DOSSIER_COURRIELS, { recursive: true });
    const nom = `${c.reference}--${c.a.replace(/[^\w.@-]/g, '_')}--${Date.now()}.html`;
    const entete = `<!-- À : ${c.a} | Sujet : ${c.sujet} -->\n`;
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

export const messagerie: Messagerie = new MessagerieLocale();

const echapper = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Gabarit sobre aux couleurs GBIS (bleu nuit, or, crème), lisible sans images. */
export function gabarit(titre: string, corps: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)}</title></head>
<body style="margin:0;background:#F7F5F0;font-family:'Source Sans 3',Arial,sans-serif;color:#101010;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF">
<div style="background:#16244A;border-bottom:3px solid #B8963E;padding:20px 24px">
<div style="font-family:'Source Serif 4',Georgia,serif;font-weight:700;font-size:20px;color:#FFFFFF">CRN Boutique</div>
<div style="color:#D9C48A;font-size:14px">Convention CRN 2026 · 6 – 13 décembre · Libreville</div></div>
<div style="padding:24px">${corps}</div>
<div style="background:#F7F5F0;padding:16px 24px;color:#6B6B6B;font-size:14px">Ministères Christ Révélé aux Nations (CRN) · contact@crn-convention2026.events · +241 62 70 51 83</div>
</div></body></html>`;
}

export { echapper };
