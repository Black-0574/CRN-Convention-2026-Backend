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

export async function emettre(payload: Payload, commandeId: number): Promise<void> {
  const deja = await payload.count({ collection: 'titulaires', where: { commande: { equals: commandeId } } });
  const dejaRetraits = await payload.count({ collection: 'retraits', where: { commande: { equals: commandeId } } });
  if (deja.totalDocs > 0 || dejaRetraits.totalDocs > 0) return;

  await convertir(payload, commandeId);
  const commande = (await payload.findByID({ collection: 'commandes', id: commandeId, depth: 1 })) as Commande;
  const saisis = (commande.titulairesSaisis ?? []) as SaisieTitulaire[];
  const billets: { numero: string; titulaire: string; email: string; produit: string; lien: string }[] = [];
  let rang = 0;
  // Articles et kits : remis selon le mode de livraison choisi à la commande.
  const aRemettre = {
    mode: commande.livraison?.mode ?? ('convention' as const),
    destination: commande.livraison?.destination ?? null,
    statut: 'a_preparer' as const,
  };

  for (const [index, ligne] of (commande.lignes ?? []).entries()) {
    const produit = ligne.produit as Produit;
    const varianteId = typeof ligne.variante === 'object' ? (ligne.variante as Variante).id : ligne.variante;
    const nominatif = !ligne.kitDe && (produit.type === 'pass' || produit.type === 'ticket');

    if (!nominatif) {
      await payload.create({
        collection: 'retraits',
        data: { commande: commande.id, variante: varianteId, libelle: ligne.libelle, quantite: ligne.quantite, ...aRemettre },
      });
      continue;
    }

    const plateformes = await plateformesDe(payload, produit.id, varianteId);
    for (const t of saisis.filter((s) => s.ligne === index)) {
      rang += 1;
      const numeroBillet = `${commande.numero}-${String(rang).padStart(2, '0')}`;
      const jeton = creerJeton(secretBillets());
      const pdf = await genererBilletPdf({
        numeroBillet,
        jeton,
        titulaire: `${t.prenom} ${t.nom}`,
        produit: ligne.libelle,
        seances: plateformes.map((p) => ({ nom: p.nom, quand: p.debut ? quand.format(new Date(p.debut)) : 'date à annoncer', lieu: p.lieu || 'lieu à annoncer' })),
        ...(t.tailleTeeShirt ? { tailleTeeShirt: t.tailleTeeShirt } : {}),
      });
      const fichier = await enregistrerBillet(numeroBillet, pdf);
      const titulaire = await payload.create({
        collection: 'titulaires',
        data: {
          numeroBillet,
          commande: commande.id,
          produit: produit.id,
          variante: varianteId,
          prenom: t.prenom,
          nom: t.nom,
          telephone: t.telephone,
          email: t.email,
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
      billets.push({ numero: numeroBillet, titulaire: `${t.prenom} ${t.nom}`, email: t.email, produit: ligne.libelle, lien: lienBillet(urlBackOffice(), numeroBillet) });
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

async function envoyerCourriels(
  payload: Payload,
  commande: Commande,
  billets: { numero: string; titulaire: string; email: string; produit: string; lien: string }[],
) {
  const reglages = await payload.findGlobal({ slug: 'reglages-boutique' });
  const livraison = texteLivraison(commande.livraison ?? {}, reglages.livraison?.horairesRetrait);
  const suivi = urlSuivi(commande.numero, commande.jetonSuivi);
  const articles = (commande.lignes ?? []).filter((l) => !billets.some((b) => b.produit === l.libelle) && (l.kitDe || (l.produit as Produit).type === 'physique'));

  const listeBillets = billets
    .map((b) => `<li style="margin-bottom:8px"><strong>${echapper(b.titulaire)}</strong> — ${echapper(b.produit)}<br><a href="${b.lien}" style="color:#1A2C5B;font-weight:700">Télécharger le billet ${b.numero}</a></li>`)
    .join('');
  const listeArticles = articles.map((a) => `<li>${echapper(a.libelle)} × ${a.quantite}</li>`).join('');

  // Un e-mail non parti (serveur indisponible, quota d'envoi du jour atteint) ne bloque jamais la
  // confirmation : billets émis et visibles sur la page de suivi, échec journalisé.
  const envoyer = (c: Courriel) =>
    messagerie.envoyer(c).catch((e) => payload.logger.error(`E-mail « ${c.sujet} » → ${c.a} non envoyé : ${(e as Error).message}`));

  await envoyer({
    a: commande.email,
    reference: commande.numero,
    sujet: `Votre commande ${commande.numero} — Convention CRN 2026`,
    html: gabarit(
      `Commande ${commande.numero}`,
      `<p>Bonjour ${echapper(commande.prenom)},</p>
<p>Votre paiement de <strong>${formaterXAF(commande.totalXAF)}</strong> est confirmé. Merci !</p>
${billets.length ? `<h2 style="font-family:'Source Serif 4',Georgia,serif;color:#1A2C5B;font-size:20px">Vos billets</h2><ul style="padding-left:20px">${listeBillets}</ul><p style="color:#6B6B6B">Chaque billet est nominatif : présentez-le avec une pièce d’identité. Le QR code est scanné à chaque entrée.</p>` : ''}
${articles.length ? `<h2 style="font-family:'Source Serif 4',Georgia,serif;color:#1A2C5B;font-size:20px">Vos articles</h2><ul style="padding-left:20px">${listeArticles}</ul><p>${echapper(livraison)}${commande.livraison?.fraisXAF ? ` Frais de livraison : ${formaterXAF(commande.livraison.fraisXAF)}.` : ''}</p>` : ''}
<p><a href="${suivi}" style="color:#1A2C5B;font-weight:700">Suivre ma commande</a></p>`,
    ),
  });

  for (const b of billets.filter((x) => x.email !== commande.email)) {
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
