/**
 * Envoi des billets par WhatsApp (Commanditaire, 16 novembre 2026) : lien « wa.me » qui ouvre
 * WhatsApp avec le message déjà rédigé, sur le téléphone du caissier (vers le numéro du client) ou
 * de l'acheteur. Aucun service ni compte WhatsApp Business : un simple lien, envoyé d'un toucher.
 */
import { formaterXAF } from './montants.ts';

const NBSP = ' ';

/**
 * Numéro international en chiffres seuls (format wa.me) ; null s'il est inexploitable.
 * Numéros locaux du Gabon (« 077 12 34 56 », « 62 70 51 83 ») complétés par l'indicatif +241.
 */
export function numeroWhatsApp(saisie: string | null | undefined, indicatif = '241'): string | null {
  const brut = (saisie ?? '').trim();
  if (!brut) return null;
  let chiffres = brut.replace(/\D/g, '');
  if (brut.startsWith('+')) return chiffres.length >= 8 && chiffres.length <= 15 ? chiffres : null;
  if (chiffres.startsWith('00')) {
    chiffres = chiffres.slice(2);
    return chiffres.length >= 8 && chiffres.length <= 15 ? chiffres : null;
  }
  if (chiffres.length === 9 && chiffres.startsWith('0')) return `${indicatif}${chiffres.slice(1)}`;
  if (chiffres.length === 8) return `${indicatif}${chiffres}`;
  return chiffres.length >= 10 && chiffres.length <= 15 ? chiffres : null;
}

/** Lien qui ouvre WhatsApp avec le message ; sans numéro, l'utilisateur choisit le destinataire. */
export function lienWhatsApp(numero: string | null, message: string): string {
  return `https://wa.me/${numero ?? ''}?text=${encodeURIComponent(message)}`;
}

export interface BilletAEnvoyer {
  titulaire: string;
  produit: string;
  lien: string;
}

/** Message des billets (typographie française : espaces insécables avant « : ; ! ? »). */
export function messageBillets(c: { prenom: string; numero: string; totalXAF: number; billets: BilletAEnvoyer[]; suivi: string }): string {
  const lignes = [
    `Bonjour ${c.prenom},`,
    '',
    `Votre paiement de ${formaterXAF(c.totalXAF)} pour la commande ${c.numero} est confirmé. Merci${NBSP}!`,
    '',
  ];
  if (c.billets.length) {
    lignes.push(`Vos billets de la Convention CRN 2026${NBSP}:`);
    for (const b of c.billets) lignes.push(`• ${b.titulaire} — ${b.produit}${NBSP}: ${b.lien}`);
    lignes.push('', `Chaque billet est nominatif${NBSP}: présentez-le avec une pièce d’identité. Le QR code est scanné à chaque entrée.`, '');
  }
  lignes.push(`Suivi de votre commande${NBSP}: ${c.suivi}`);
  return lignes.join('\n');
}
