/**
 * Billet PDF d'un titulaire (format A6) : bandeau bleu nuit, nom du titulaire, produit, séances
 * ouvertes, QR code du jeton signé (aucune donnée personnelle dans le QR). Polices standard PDF
 * (Helvetica / Times) : lisibles partout, sans fichier de police à embarquer.
 *
 * Liens de téléchargement signés (HMAC) avec date d'expiration ; vérifiés à temps constant.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';

const BLEU_NUIT = rgb(0x1a / 255, 0x2c / 255, 0x5b / 255);
const BLEU_PROFOND = rgb(0x16 / 255, 0x24 / 255, 0x4a / 255);
const OR = rgb(0xb8 / 255, 0x96 / 255, 0x3e / 255);
const NOIR = rgb(0x10 / 255, 0x10 / 255, 0x10 / 255);
const GRIS = rgb(0x6b / 255, 0x6b / 255, 0x6b / 255);

export const DOSSIER_BILLETS = process.env.BILLETS_DIR || path.resolve(process.cwd(), '.billets');

/** Les polices standard PDF n'ont que le jeu WinAnsi : espaces fines/insécables → espace simple. */
const pdfTexte = (t: string) => t.replace(/[  ]/g, ' ').replace(/[^\x20-\x7E -ÿ–—‘’“”…Œœ€]/g, '');

export interface DonneesBillet {
  numeroBillet: string;
  jeton: string;
  titulaire: string;
  produit: string;
  seances: { nom: string; quand: string; lieu: string }[];
  tailleTeeShirt?: string;
}

export async function genererBilletPdf(b: DonneesBillet): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Billet ${b.numeroBillet} — Convention CRN 2026`);
  doc.setAuthor('Ministères Christ Révélé aux Nations (CRN)');
  const page = doc.addPage([297.6, 419.5]); // A6 portrait, en points
  const { width, height } = page.getSize();
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansGras = await doc.embedFont(StandardFonts.HelveticaBold);
  const marge = 18;

  page.drawRectangle({ x: 0, y: height - 58, width, height: 58, color: BLEU_PROFOND });
  page.drawRectangle({ x: 0, y: height - 61, width, height: 3, color: OR });
  page.drawText(pdfTexte('CONVENTION CRN 2026'), { x: marge, y: height - 30, size: 15, font: serif, color: rgb(1, 1, 1) });
  page.drawText(pdfTexte('6 – 13 décembre 2026 · Libreville'), { x: marge, y: height - 47, size: 8.5, font: sans, color: rgb(0.85, 0.77, 0.54) });

  let y = height - 84;
  page.drawText(pdfTexte(b.produit), { x: marge, y, size: 12, font: sansGras, color: BLEU_NUIT, maxWidth: width - 2 * marge });
  y -= 18;
  page.drawText(pdfTexte(b.titulaire), { x: marge, y, size: 13, font: serif, color: NOIR });
  y -= 12;
  page.drawText(pdfTexte(`Billet n° ${b.numeroBillet}`), { x: marge, y, size: 8, font: sans, color: GRIS });

  const qr = await QRCode.toBuffer(b.jeton, { errorCorrectionLevel: 'M', margin: 1, width: 360, color: { dark: '#101010', light: '#FFFFFF' } });
  const image = await doc.embedPng(qr);
  const cote = 150;
  y -= cote + 10;
  page.drawImage(image, { x: (width - cote) / 2, y, width: cote, height: cote });
  // Code lisible sous le QR : saisie manuelle par l'agent si le QR est abîmé ou illisible.
  const largeurCode = sans.widthOfTextAtSize(b.jeton, 5.5);
  y -= 9;
  page.drawText(b.jeton, { x: (width - largeurCode) / 2, y, size: 5.5, font: sans, color: GRIS });

  y -= 14;
  page.drawText(pdfTexte('Séances incluses'), { x: marge, y, size: 8.5, font: sansGras, color: BLEU_NUIT });
  for (const s of b.seances.slice(0, 7)) {
    y -= 11;
    page.drawText(pdfTexte(`• ${s.nom} — ${s.quand}${s.lieu ? `, ${s.lieu}` : ''}`), { x: marge, y, size: 7, font: sans, color: NOIR, maxWidth: width - 2 * marge });
  }
  if (b.seances.length > 7) {
    y -= 11;
    page.drawText(pdfTexte(`… et ${b.seances.length - 7} autres séances`), { x: marge, y, size: 7, font: sans, color: GRIS });
  }
  if (b.tailleTeeShirt) {
    y -= 13;
    page.drawText(pdfTexte(`Kit à retirer — tee-shirt taille ${b.tailleTeeShirt}`), { x: marge, y, size: 7.5, font: sansGras, color: BLEU_NUIT });
  }

  page.drawRectangle({ x: 0, y: 0, width, height: 30, color: rgb(0xf7 / 255, 0xf5 / 255, 0xf0 / 255) });
  page.drawText(pdfTexte('Billet nominatif et non transférable. QR code scanné à chaque entrée ;'), { x: marge, y: 17, size: 6.5, font: sans, color: GRIS });
  page.drawText(pdfTexte('pièce d’identité au nom du titulaire exigée. Aucun accès verbal.'), { x: marge, y: 8, size: 6.5, font: sans, color: GRIS });

  return doc.save();
}

export async function enregistrerBillet(numeroBillet: string, pdf: Uint8Array): Promise<string> {
  await mkdir(DOSSIER_BILLETS, { recursive: true });
  const fichier = `${numeroBillet.replace(/[^\w-]/g, '_')}.pdf`;
  await writeFile(path.join(DOSSIER_BILLETS, fichier), pdf);
  return fichier;
}

export const lireBillet = (fichier: string) => readFile(path.join(DOSSIER_BILLETS, path.basename(fichier)));

// ——— Liens signés ———

const secretLiens = () => {
  const s = process.env.LIENS_SECRET ?? '';
  if (s.length < 32) throw new Error('LIENS_SECRET manquant ou trop court (32 caractères minimum).');
  return s;
};

const signature = (numero: string, exp: number) => createHmac('sha256', secretLiens()).update(`billet:${numero}:${exp}`).digest('base64url');

/** Lien de téléchargement d'un billet, valable jusqu'à la fin de la Convention. */
export function lienBillet(base: string, numero: string, expiration = new Date('2026-12-14T23:00:00Z')): string {
  const exp = Math.floor(expiration.getTime() / 1000);
  return `${base.replace(/\/$/, '')}/api/boutique/billets/${encodeURIComponent(numero)}?exp=${exp}&sig=${signature(numero, exp)}`;
}

export function lienValide(numero: string, exp: string | null, sig: string | null, maintenant = new Date()): boolean {
  const e = Number(exp);
  if (!Number.isInteger(e) || !sig || e * 1000 < maintenant.getTime()) return false;
  const attendue = Buffer.from(signature(numero, e));
  const recue = Buffer.from(sig);
  return attendue.length === recue.length && timingSafeEqual(attendue, recue);
}
