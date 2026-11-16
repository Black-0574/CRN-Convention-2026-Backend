/**
 * Émission après paiement confirmé (webhook) : pour chaque exemplaire de pass ou de ticket, un
 * titulaire avec son jeton signé, ses droits d'accès par plateforme et son billet PDF ; un article
 * à remettre par article ou kit, selon le mode de livraison choisi ; e-mail à l'acheteur (tous les billets) et à chaque titulaire (le sien).
 * Idempotent : une commande déjà émise ne l'est pas deux fois.
 */
import { creerJeton, empreinteJeton, formaterXAF, genererDroits } from '../domaine/src/index.ts';
import type { Payload } from 'payload';

import type { Commande, Plateforme, Produit, Variante } from '../../payload-types';
import { enregistrerBillet, genererBilletPdf, lienBillet } from './billets';
import { texteLivraison } from './livraison';
import { urlBackOffice, urlSuivi } from './urls';
import { convertir } from './ventes';
import { echapper, gabarit, messagerie, type Courriel } from './messagerie';
import type { SaisieTitulaire } from './ventes';

const quand = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville' });

const secretBillets = () => {
  const s = process.env.BILLETS_SECRET ?? '';
  if (s.length < 32) throw new Error('BILLETS_SECRET manquant ou trop court (32 caractères minimum).');
  return s;
};


async function plateformesDe(payload: Payload, produitId: number, varianteId: number): Promise<Plateforme[]> {
  const v = (await payload.findByID({ collection: 'variantes', id: varianteId, depth: 1 })) as Variante;
  const propres = (v.plateformes ?? []).filter((p): p is Plateforme => typeof p === 'object');
  if (propres.length) return propres;
  const p = (await payload.findByID({ collection: 'produits', id: produitId, depth: 1 })) as Produit;
  return (p.plateformes ?? []).filter((x): x is Plateforme => typeof x === 'object');
}

type BilletEmis = { numero: string; titulaire: string; email: string; produit: string; lien: string };

/** Un billet : jeton signé, PDF, titulaire et droits d'accès à chaque séance. */
async function emettreBillet(
  payload: Payload,
  commande: Commande,
  libelle: string,
  produitId: number,
  varianteId: number,
  plateformes: Plateforme[],
  t: SaisieTitulaire,
  numeroBillet: string,
): Promise<BilletEmis> {
  const jeton = creerJeton(secretBillets());
  const pdf = await genererBilletPdf({
    numeroBillet,
    jeton,
    titulaire: `${t.prenom} ${t.nom}`,
    produit: libelle,
    seances: plateformes.map((p) => ({ nom: p.nom, quand: p.debut ? quand.format(new Date(p.debut)) : 'date à annoncer', lieu: p.lieu || 'lieu à annoncer' })),
    ...(t.tailleTeeShirt ? { tailleTeeShirt: t.tailleTeeShirt } : {}),
  });
  const fichier = await enregistrerBillet(numeroBillet, pdf);
  const titulaire = await payload.create({
    collection: 'titulaires',
    data: {
      numeroBillet,
      commande: commande.id,
      produit: produitId,
      variante: varianteId,
      prenom: t.prenom,
      nom: t.nom,
      telephone: t.telephone,
      email: t.email ?? '',
      ...(t.dateNaissance ? { dateNaissance: t.dateNaissance } : {}),
      ...(t.tailleTeeShirt ? { tailleTeeShirt: t.tailleTeeShirt } : {}),
      empreinteJeton: empreinteJeton(jeton),
      fichierBillet: fichier,
      emisA: new Date().toISOString(),
    },
  });
  for (const d of genererDroits(plateformes.map((p) => String(p.id)))) {
    await payload.create({ collection: 'droits-acces', data: { titulaire: titulaire.id, plateforme: Number(d.plateforme), statut: 'valide' } });
  }
  return { numero: numeroBillet, titulaire: `${t.prenom} ${t.nom}`, email: t.email, produit: libelle, lien: lienBillet(urlBackOffice(), numeroBillet) };
}

export async function emettre(payload: Payload, commandeId: number): Promise<void> {
  const deja = await payload.count({ collection: 'titulaires', where: { commande: { equals: commandeId } } });
  const dejaRetraits = await payload.count({ collection: 'retraits', where: { commande: { equals: commandeId } } });
  if (deja.totalDocs > 0 || dejaRetraits.totalDocs > 0) return;

  await convertir(payload, commandeId);
  const commande = (await payload.findByID({ collection: 'commandes', id: commandeId, depth: 1 })) as Commande;
  const saisis = (commande.titulairesSaisis ?? []) as SaisieTitulaire[];
  const billets: BilletEmis[] = [];
  let rang = 0;
  // Articles et kits : remis selon le mode de livraison choisi à la commande.
  const aRemettre = {
    mode: commande.livraison?.mode ?? ('convention' as const),
    destination: commande.livraison?.destination ?? null,
    statut: 'a_preparer' as const,
  };

  // Les titulaires saisis portent le rang de leur ligne dans le panier ; dans la commande, les
  // articles du kit d'un pass s'insèrent après lui. Le rang du panier est donc celui de la ligne
  // parmi les lignes hors kit (corrigé le 16 novembre 2026 : dans une commande « pass avec kit,
  // puis autre billet », le second billet n'était pas émis).
  let rangPanier = -1;
  for (const ligne of commande.lignes ?? []) {
    if (!ligne.kitDe) rangPanier += 1;
    const produit = ligne.produit as Produit;
    const varianteId = typeof ligne.variante === 'object' ? (ligne.variante as Variante).id : ligne.variante;
    const nominatif = !ligne.kitDe && (produit.type === 'pass' || produit.type === 'ticket');

    if (!nominatif) {
      // Articles achetés seuls ; les articles de kit sont inscrits plus bas, une seule fois
      // (ils l'étaient aussi ici : chaque article de kit apparaissait deux fois à remettre).
      if (!ligne.kitDe) {
        await payload.create({
          collection: 'retraits',
          data: { commande: commande.id, variante: varianteId, libelle: ligne.libelle, quantite: ligne.quantite, ...aRemettre },
        });
      }
      continue;
    }

    const plateformes = await plateformesDe(payload, produit.id, varianteId);
    const rangLigne = rangPanier;
    for (const t of saisis.filter((s) => s.ligne === rangLigne)) {
      rang += 1;
      billets.push(await emettreBillet(payload, commande, ligne.libelle, produit.id, varianteId, plateformes, t, `${commande.numero}-${String(rang).padStart(2, '0')}`));
    }
  }

  // Lignes de kit : article à remettre, rattaché au titulaire concerné (nom repris dans le libellé).
  for (const ligne of commande.lignes ?? []) {
    if (!ligne.kitDe) continue;
    const varianteId = typeof ligne.variante === 'object' ? (ligne.variante as Variante).id : ligne.variante;
    await payload.create({
      collection: 'retraits',
      data: { commande: commande.id, variante: varianteId, libelle: ligne.libelle, quantite: ligne.quantite, ...aRemettre },
    });
  }

  await envoyerCourriels(payload, commande, billets);
}

/**
 * Rattrapage (16 novembre 2026) : avant la correction ci-dessus, une commande « pass avec kit, puis
 * autre billet » payée ne recevait pas le billet de la ligne suivante. Au démarrage, chaque
 * commande payée est comparée à ses titulaires saisis : un billet attendu et absent (même ligne,
 * même prénom et nom) est émis et envoyé, avec la numérotation qui suit. Ajouts seulement :
 * un billet émis sur la mauvaise ligne, ou un article de kit inscrit deux fois à remettre, est
 * signalé dans le journal du serveur pour vérification, jamais supprimé.
 */
export async function rattraperBilletsManquants(payload: Payload): Promise<void> {
  const payees = (await payload.find({ collection: 'commandes', where: { statut: { equals: 'payee' } }, limit: 10000, depth: 1, pagination: false })).docs as Commande[];
  for (const commande of payees) {
    const saisis = (commande.titulairesSaisis ?? []) as SaisieTitulaire[];
    if (!saisis.length) continue;
    const existants = (await payload.find({ collection: 'titulaires', where: { commande: { equals: commande.id } }, limit: 500, depth: 0, pagination: false })).docs;
    const varianteDe = (v: unknown) => (typeof v === 'object' && v ? (v as Variante).id : Number(v));
    const libres = [...existants];
    const nouveaux: BilletEmis[] = [];
    // Payée sans aucun billet : statut changé à la main dans l'admin, pas le défaut corrigé ici.
    // Signalée seulement : l'émission (et l'envoi au client) reste une décision de la boutique.
    if (!existants.length) {
      payload.logger.warn(`Commande ${commande.numero} : payée sans aucun billet émis (statut changé à la main ?) : à vérifier.`);
      continue;
    }
    let rang = existants.reduce((max, t) => Math.max(max, Number(/-(\d+)$/.exec(t.numeroBillet)?.[1] ?? 0)), 0);
    let rangPanier = -1;
    for (const ligne of commande.lignes ?? []) {
      if (!ligne.kitDe) rangPanier += 1;
      const produit = ligne.produit as Produit;
      if (ligne.kitDe || (produit.type !== 'pass' && produit.type !== 'ticket')) continue;
      const varianteId = varianteDe(ligne.variante);
      const rangLigne = rangPanier;
      for (const t of saisis.filter((s) => s.ligne === rangLigne)) {
        const i = libres.findIndex((x) => varianteDe(x.variante) === varianteId && x.prenom === t.prenom && x.nom === t.nom);
        if (i >= 0) {
          libres.splice(i, 1);
          continue;
        }
        rang += 1;
        nouveaux.push(await emettreBillet(payload, commande, ligne.libelle, produit.id, varianteId, await plateformesDe(payload, produit.id, varianteId), t, `${commande.numero}-${String(rang).padStart(2, '0')}`));
      }
    }
    if (nouveaux.length) {
      payload.logger.warn(`Commande ${commande.numero} : ${nouveaux.length} billet(s) manquant(s) émis (${nouveaux.map((b) => `${b.numero} ${b.titulaire}`).join(', ')}).`);
      await envoyerCourriels(payload, commande, nouveaux, true);
    }
    if (libres.length) payload.logger.warn(`Commande ${commande.numero} : billet(s) à vérifier, ne correspondant à aucun titulaire saisi sur cette ligne : ${libres.map((t) => t.numeroBillet).join(', ')}.`);
    const retraits = (await payload.find({ collection: 'retraits', where: { commande: { equals: commande.id } }, limit: 500, depth: 0, pagination: false })).docs;
    const vus = new Set<string>();
    const doublons = retraits.filter((r) => {
      const cle = `${varianteDe(r.variante)}|${r.libelle}`;
      if (vus.has(cle)) return true;
      vus.add(cle);
      return false;
    });
    if (doublons.length) payload.logger.warn(`Commande ${commande.numero} : ${doublons.length} article(s) de kit inscrit(s) deux fois à remettre (Livraisons et retraits) : remettre une seule fois.`);
  }
}

async function envoyerCourriels(
  payload: Payload,
  commande: Commande,
  billets: BilletEmis[],
  /** Billets émis en rattrapage : e-mail d'excuse avec ces seuls billets. */
  rattrapage = false,
) {
  const reglages = await payload.findGlobal({ slug: 'reglages-boutique' });
  const livraison = texteLivraison(commande.livraison ?? {}, reglages.livraison?.horairesRetrait);
  const suivi = urlSuivi(commande.numero, commande.jetonSuivi);
  const articles = rattrapage ? [] : (commande.lignes ?? []).filter((l) => !billets.some((b) => b.produit === l.libelle) && (l.kitDe || (l.produit as Produit).type === 'physique'));

  const listeBillets = billets
    .map((b) => `<li style="margin-bottom:8px"><strong>${echapper(b.titulaire)}</strong> — ${echapper(b.produit)}<br><a href="${b.lien}" style="color:#1A2C5B;font-weight:700">Télécharger le billet ${b.numero}</a></li>`)
    .join('');
  const listeArticles = articles.map((a) => `<li>${echapper(a.libelle)} × ${a.quantite}</li>`).join('');

  // Un e-mail non parti (serveur indisponible, quota d'envoi du jour atteint) ne bloque jamais la
  // confirmation : billets émis et visibles sur la page de suivi, échec journalisé.
  const envoyer = (c: Courriel) =>
    messagerie.envoyer(c).catch((e) => payload.logger.error(`E-mail « ${c.sujet} » → ${c.a} non envoyé : ${(e as Error).message}`));

  // Acheteur sans e-mail (billets envoyés par WhatsApp seulement) : rien à envoyer à l'acheteur.
  if (commande.email) await envoyer({
    a: commande.email,
    reference: commande.numero,
    sujet: rattrapage ? `Billet(s) manquant(s) de votre commande ${commande.numero} — Convention CRN 2026` : `Votre commande ${commande.numero} — Convention CRN 2026`,
    html: gabarit(
      `Commande ${commande.numero}`,
      `<p>Bonjour ${echapper(commande.prenom)},</p>
${rattrapage ? '<p>Un incident technique a empêché l’envoi d’une partie de vos billets. Les voici, avec toutes nos excuses&nbsp;; vos autres billets restent valables.</p>' : `<p>Votre paiement de <strong>${formaterXAF(commande.totalXAF)}</strong> est confirmé. Merci&nbsp;!</p>`}
${billets.length ? `<h2 style="font-family:'Source Serif 4',Georgia,serif;color:#1A2C5B;font-size:20px">Vos billets</h2><ul style="padding-left:20px">${listeBillets}</ul><p style="color:#6B6B6B">Chaque billet est nominatif : présentez-le avec une pièce d’identité. Le QR code est scanné à chaque entrée.</p>` : ''}
${articles.length ? `<h2 style="font-family:'Source Serif 4',Georgia,serif;color:#1A2C5B;font-size:20px">Vos articles</h2><ul style="padding-left:20px">${listeArticles}</ul><p>${echapper(livraison)}${commande.livraison?.fraisXAF ? ` Frais de livraison : ${formaterXAF(commande.livraison.fraisXAF)}.` : ''}</p>` : ''}
<p><a href="${suivi}" style="color:#1A2C5B;font-weight:700">Suivre ma commande</a></p>`,
    ),
  });

  for (const b of billets.filter((x) => x.email && x.email !== commande.email)) {
    await envoyer({
      a: b.email,
      reference: commande.numero,
      sujet: `Votre billet ${b.numero} — Convention CRN 2026`,
      html: gabarit(
        `Billet ${b.numero}`,
        `<p>Bonjour ${echapper(b.titulaire)},</p><p>${echapper(commande.prenom)} ${echapper(commande.nom)} vous a offert : <strong>${echapper(b.produit)}</strong>.</p>
<p><a href="${b.lien}" style="color:#1A2C5B;font-weight:700">Télécharger votre billet ${b.numero}</a></p>
<p style="color:#6B6B6B">Billet nominatif et non transférable : présentez-le avec une pièce d’identité.</p>`,
      ),
    });
  }
}
