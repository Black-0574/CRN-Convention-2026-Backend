/**
 * Import initial du catalogue de la CRN Boutique (idempotent : ne fait rien si des produits
 * existent déjà).
 *
 * Sources (aucune donnée inventée) :
 * - produits, prix et horaires validés pour le site : docs/donnees-reference.md (7 tickets, tee-shirt,
 *   pagne) → mis en vente ;
 * - pass Or, Diamant, Convention Intégral, Génération, Génération Plus : montants et contenus du
 *   prompt maître « CRN Boutique », NON validés par le CRN → importés « Prix à valider », jamais en
 *   vente (visibles seulement en démonstration locale, marqués « aperçu ») ;
 * - capacités des quotas et stocks : inconnus → vides en production (ventes bloquées / stock non
 *   suivi) ; valeurs de démonstration UNIQUEMENT si BOUTIQUE_DEMO=1.
 *
 * Comptes : un administrateur et un agent COM Boutique de démonstration, identifiants lus dans .env
 * (BOUTIQUE_ADMIN_EMAIL / BOUTIQUE_ADMIN_MOT_DE_PASSE, BOUTIQUE_AGENT_EMAIL / BOUTIQUE_AGENT_MOT_DE_PASSE).
 *
 * Appelé au démarrage du back-office (onInit), après l'import du contenu du site.
 */
import type { Payload } from 'payload';

export async function seedBoutique(payload: Payload): Promise<void> {
  const DEMO = process.env.BOUTIQUE_DEMO === '1' && process.env.NODE_ENV !== 'production';

  const L = (jour: string, heure: string) => new Date(`${jour}T${heure}:00+01:00`).toISOString();
  const EGLISE = 'Église Centrale';
  const NOMAD = 'Nomad';

  const creerUtilisateur = async (email: string | undefined, motDePasse: string | undefined, nomComplet: string, role: string) => {
    if (!email || !motDePasse) return payload.logger.warn(`${nomComplet} : identifiants absents de .env, compte non créé.`);
    const existe = await payload.count({ collection: 'users', where: { email: { equals: email } } });
    if (existe.totalDocs) return;
    await payload.create({ collection: 'users', data: { email, password: motDePasse, nom: nomComplet, role: role as never } });
    payload.logger.info(`Compte créé : ${nomComplet} (${role}).`);
  };

  await creerUtilisateur(process.env.BOUTIQUE_ADMIN_EMAIL, process.env.BOUTIQUE_ADMIN_MOT_DE_PASSE, 'Administrateur (démonstration locale)', 'admin');
  await creerUtilisateur(process.env.BOUTIQUE_AGENT_EMAIL, process.env.BOUTIQUE_AGENT_MOT_DE_PASSE, 'Agent COM Boutique (démonstration locale)', 'com_boutique');

  // Livraison : en démonstration locale seulement, un point et des frais fictifs, signalés comme
  // tels (la liste réelle des églises du réseau et les frais sont saisis par le CRN).
  if (DEMO && (await payload.count({ collection: 'points-livraison' })).totalDocs === 0) {
    for (const [i, [nom, ville, pays, fraisXAF]] of ([
      ['Église de démonstration — Libreville', 'Libreville', 'Gabon', 0],
      ['Église de démonstration — Paris', 'Paris', 'France', 15_000],
    ] as const).entries()) {
      await payload.create({ collection: 'points-livraison', data: { nom, ville, pays, fraisXAF, delai: 'démonstration', ordre: i } });
    }
    await payload.updateGlobal({ slug: 'reglages-boutique', data: { livraison: { retraitConvention: true, domicile: { actif: true, zone: 'Libreville', fraisXAF: 2_000, delai: 'démonstration' } } } });
  }

  if ((await payload.count({ collection: 'produits' })).totalDocs > 0) return;

  // ——— Catégories ———
  const cat = async (nom: string, slug: string, pole: 'billetterie' | 'physique' | 'numerique', ordre: number) =>
    (await payload.create({ collection: 'categories', data: { nom, slug, pole, ordre } })).id;
  const catPass = await cat('Pass', 'pass', 'billetterie', 1);
  const catTickets = await cat('Tickets à l’unité', 'tickets', 'billetterie', 2);
  const catArticles = await cat('Articles officiels', 'articles', 'physique', 3);

  // ——— Plateformes (séances) — programme : docs/donnees-reference.md ———
  const plateforme = async (code: string, nom: string, debut: string | null, fin: string | null, lieu: string | null, publique = true) =>
    (await payload.create({ collection: 'plateformes', data: { code, nom, ...(debut ? { debut } : {}), ...(fin ? { fin } : {}), ...(lieu ? { lieu } : {}), publique } })).id;

  const JOURS_ACADEMIE = ['2026-12-08', '2026-12-09', '2026-12-10'];
  const CLASSES = [
    { n: 1, nom: 'Bâtisseurs d’Autels', debut: '09:00', fin: '10:00' },
    { n: 2, nom: 'Le Mystère des Trônes', debut: '10:15', fin: '11:15' },
    { n: 3, nom: 'Architectes de la Cité', debut: '11:30', fin: '12:30' },
  ];
  const jourCourt = (j: string) => `${Number(j.slice(8))} déc.`;
  const academie: Record<number, number[]> = { 1: [], 2: [], 3: [] };
  for (const c of CLASSES) {
    for (const j of JOURS_ACADEMIE) {
      academie[c.n]!.push(await plateforme(`academie-classe-${c.n}-${j}`, `Académie — ${c.nom} (${jourCourt(j)})`, L(j, c.debut), L(j, c.fin), EGLISE));
    }
  }
  const toutesClasses = Object.values(academie).flat();
  const femmeDeFoi = await plateforme('femme-de-foi-live', 'Femme de Foi — Live', L('2026-12-12', '08:00'), L('2026-12-12', '11:00'), EGLISE);
  const jaiSoif = await plateforme('jai-soif', 'J’ai soif', L('2026-12-12', '13:00'), L('2026-12-12', '16:30'), EGLISE);
  const diner = await plateforme('diner-des-elites', 'Dîner des Élites', L('2026-12-12', '19:00'), L('2026-12-12', '22:00'), null);
  const concertStandard = await plateforme('concert-standard', 'Concert pour la vie — Standard', L('2026-12-13', '17:00'), null, NOMAD);
  const concertVip = await plateforme('concert-vip', 'Concert pour la vie — VIP', L('2026-12-13', '17:00'), null, NOMAD);
  const plenieresReservees = [];
  for (const j of JOURS_ACADEMIE) plenieresReservees.push(await plateforme(`pleniere-placement-reserve-${j}`, `Plénière — placement réservé (${jourCourt(j)})`, L(j, '17:00'), L(j, '21:00'), EGLISE));
  // Jamais affiché au public (règle permanente du site) : n'apparaît que sur le billet du titulaire.
  const repasDiamant = await plateforme('repas-prive-diamant', 'Repas privé des partenaires Diamant', L('2026-12-10', '12:00'), null, 'Palais de l’Orient', false);

  // ——— Quotas (capacités inconnues : vides en production) ———
  const quotaDiner = (await payload.create({ collection: 'quotas', data: { nom: 'Dîner des Élites', ...(DEMO ? { capacite: 50 } : {}) } })).id;
  const quotaRepas = (await payload.create({ collection: 'quotas', data: { nom: 'Repas privé des partenaires Diamant', ...(DEMO ? { capacite: 20 } : {}) } })).id;

  // ——— Produits ———
  type Variante = { libelle: string; stock?: number; plateformes?: number[]; ordre?: number };
  // Créé inactif, puis activé une fois ses variantes en place : un pass dont les séances sont
  // portées par les variantes (ex. choix de la classe) n'est valide qu'avec elles.
  async function produit(d: Record<string, unknown>, variantes: Variante[] = [{ libelle: 'Unique' }]) {
    const p = await payload.create({ collection: 'produits', data: { ...d, actif: false } as never });
    for (const [i, v] of variantes.entries()) {
      await payload.create({
        collection: 'variantes',
        data: { produit: p.id, libelle: v.libelle, sku: `${p.slug}-${v.libelle}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), ordre: v.ordre ?? i, ...(v.stock !== undefined ? { stock: v.stock } : {}), ...(v.plateformes ? { plateformes: v.plateformes } : {}) },
      });
    }
    if (d.actif) await payload.update({ collection: 'produits', id: p.id, data: { actif: true } });
    return p.id;
  }
  const prix = (prixXAF: number, du = '2026-10-25') => [{ prixXAF, du }];
  const valide = { actif: true, prixAValider: false };
  const aValider = { actif: false, prixAValider: true };

  // Articles officiels (validés, 10 000 F CFA chacun).
  const TAILLES = ['S', 'M', 'L', 'XL', 'XXL'];
  const teeShirt = await produit(
    { nom: 'Tee-shirt officiel', slug: 'tee-shirt-officiel', type: 'physique', categorie: catArticles, resume: 'Tee-shirt officiel de la Convention CRN 2026.', description: 'Tee-shirt officiel de la Convention CRN 2026. Retrait sur le lieu de la Convention.', paliers: prix(10_000), ...valide, misEnAvant: true, ordreMiseEnAvant: 6, ordre: 30 },
    TAILLES.map((libelle) => ({ libelle, ...(DEMO ? { stock: 40 } : {}) })),
  );
  const pagne = await produit(
    { nom: 'Pagne officiel mixte', slug: 'pagne-officiel', type: 'physique', categorie: catArticles, resume: 'Pagne officiel de la Convention CRN 2026, modèle mixte.', description: 'Pagne officiel de la Convention CRN 2026, modèle mixte. Retrait sur le lieu de la Convention.', paliers: prix(10_000), ...valide, misEnAvant: true, ordreMiseEnAvant: 7, ordre: 31 },
    [{ libelle: 'Unique', ...(DEMO ? { stock: 100 } : {}) }],
  );
  // Articles de kit sans prix connu : jamais vendus seuls.
  const kitSeul = async (nom: string, slug: string) => produit({ nom, slug, type: 'physique', categorie: catArticles, ...aValider, ordre: 90 });
  const stylo = await kitSeul('Stylo officiel', 'stylo-officiel');
  const blocNotes = await kitSeul('Bloc-notes officiel', 'bloc-notes-officiel');
  const gourde = await kitSeul('Gourde officielle', 'gourde-officielle');
  const ventilateur = await kitSeul('Ventilateur', 'ventilateur');
  const petitVentilateur = await kitSeul('Petit ventilateur', 'petit-ventilateur');

  // Tickets à l'unité (validés).
  await produit(
    { nom: 'Une classe de l’Académie', slug: 'academie-une-classe', type: 'ticket', categorie: catTickets, resume: 'Une classe complète sur trois jours (8, 9 et 10 décembre).', description: 'Classe complète sur trois jours (8, 9, 10 décembre), au choix parmi les trois classes de l’Académie des Sciences Divines, Église Centrale.', paliers: prix(20_000), ...valide, ordre: 20 },
    CLASSES.map((c) => ({ libelle: `Classe ${c.n} — ${c.nom}`, plateformes: academie[c.n]! })),
  );
  await produit({ nom: 'Pass Académie Intégral', slug: 'pass-academie-integral', type: 'ticket', categorie: catTickets, resume: 'Les trois classes de l’Académie, du 8 au 10 décembre.', description: 'Les trois classes de l’Académie des Sciences Divines, du 8 au 10 décembre, Église Centrale.', badge: 'Les trois classes', paliers: prix(50_000), plateformes: toutesClasses, ...valide, misEnAvant: true, ordreMiseEnAvant: 8, ordre: 21 });
  await produit({ nom: 'Femme de Foi — Live', slug: 'femme-de-foi-live', type: 'ticket', categorie: catTickets, resume: 'Samedi 12 décembre, 8h–11h, Église Centrale.', description: 'Samedi 12 décembre, 8h–11h, Église Centrale.', paliers: prix(10_000), plateformes: [femmeDeFoi], ...valide, misEnAvant: true, ordreMiseEnAvant: 11, ordre: 22 });
  await produit({ nom: 'J’ai soif', slug: 'jai-soif', type: 'ticket', categorie: catTickets, resume: 'Samedi 12 décembre, 13h–16h30, Église Centrale.', description: 'Samedi 12 décembre, 13h–16h30, Église Centrale.', paliers: prix(5_000), plateformes: [jaiSoif], ...valide, ordre: 23 });
  await produit({ nom: 'Dîner des Élites', slug: 'diner-des-elites', type: 'ticket', categorie: catTickets, resume: 'Samedi 12 décembre, 19h–22h. Lieu à annoncer.', description: 'Samedi 12 décembre, 19h–22h. Lieu à annoncer.', badge: 'Places limitées', paliers: prix(100_000), plateformes: [diner], quotas: [quotaDiner], ...valide, misEnAvant: true, ordreMiseEnAvant: 10, ordre: 24 });
  await produit({ nom: 'Concert pour la vie — Standard', slug: 'concert-standard', type: 'ticket', categorie: catTickets, resume: 'Dimanche 13 décembre, 17h, Nomad.', description: 'Dimanche 13 décembre, 17h, Nomad.', paliers: prix(5_000), plateformes: [concertStandard], ...valide, ordre: 25 });
  await produit({ nom: 'Concert pour la vie — VIP', slug: 'concert-vip', type: 'ticket', categorie: catTickets, resume: 'Dimanche 13 décembre, 17h, Nomad.', description: 'Dimanche 13 décembre, 17h, Nomad.', paliers: prix(25_000), plateformes: [concertVip], ...valide, misEnAvant: true, ordreMiseEnAvant: 9, ordre: 26 });

  // Pass au prix NON validé (prompt maître) : « Prix à valider », jamais en vente en production.
  const accesIntegral = [...toutesClasses, femmeDeFoi, jaiSoif, diner, concertStandard];
  await produit({
    nom: 'Pass Convention Intégral', slug: 'pass-convention-integral', type: 'pass', categorie: catPass,
    resume: 'Académie (3 classes), Femme de Foi — Live, J’ai soif, Dîner des Élites, Concert Standard. Tee-shirt inclus.',
    description: 'Académie des Sciences Divines (3 classes), Femme de Foi — Live, J’ai soif, Dîner des Élites, Concert pour la vie — Standard et plateformes générales. Tee-shirt officiel 2026 inclus (taille au choix, à retirer).',
    badge: 'Inclut le tee-shirt',
    paliers: [{ prixXAF: 120_000, du: '2026-10-25', au: '2026-10-31' }, { prixXAF: 150_000, du: '2026-11-01', au: '2026-11-30' }, { prixXAF: 180_000, du: '2026-12-01' }],
    plateformes: accesIntegral, quotas: [quotaDiner], kit: [{ produit: teeShirt, quantite: 1 }],
    ...aValider, misEnAvant: true, ordreMiseEnAvant: 1, ordre: 1,
  });
  await produit({ nom: 'Pass Génération', slug: 'pass-generation', type: 'pass', categorie: catPass, resume: 'Pour les 18 – 28 ans : mêmes accès que l’Intégral, hors Dîner des Élites.', description: 'Réservé aux 18 – 28 ans (contrôle déclaratif). Mêmes accès que le Pass Convention Intégral, hors Dîner des Élites.', paliers: prix(50_000), plateformes: [...toutesClasses, femmeDeFoi, jaiSoif, concertStandard], ageMin: 18, ageMax: 28, ...aValider, misEnAvant: true, ordreMiseEnAvant: 2, ordre: 2 });
  await produit({ nom: 'Pass Génération Plus', slug: 'pass-generation-plus', type: 'pass', categorie: catPass, resume: 'Pour les 18 – 28 ans : mêmes accès que l’Intégral.', description: 'Réservé aux 18 – 28 ans (contrôle déclaratif). Mêmes accès que le Pass Convention Intégral ; articles vendus séparément.', paliers: prix(100_000), plateformes: accesIntegral, quotas: [quotaDiner], ageMin: 18, ageMax: 28, ...aValider, misEnAvant: true, ordreMiseEnAvant: 3, ordre: 3 });
  const accesPartenaire = [...toutesClasses, femmeDeFoi, jaiSoif, diner, concertVip, ...plenieresReservees];
  await produit({
    nom: 'Pass Partenaire Or', slug: 'pass-or', type: 'pass', categorie: catPass,
    resume: 'Accès intégral, Concert VIP, plénières réservées, Dîner des Élites, badge Or.',
    description: 'Accès intégral, Concert pour la vie — VIP, plénières en placement réservé, Dîner des Élites, badge Or. Kit : pagne mixte, tee-shirt 2026, petit ventilateur.',
    badge: 'Places limitées', paliers: prix(500_000), plateformes: accesPartenaire, quotas: [quotaDiner],
    kit: [{ produit: pagne, quantite: 1 }, { produit: teeShirt, quantite: 1 }, { produit: petitVentilateur, quantite: 1 }],
    ...aValider, misEnAvant: true, ordreMiseEnAvant: 4, ordre: 4,
  });
  await produit({
    nom: 'Pass Grand Partenaire Diamant', slug: 'pass-diamant', type: 'pass', categorie: catPass,
    resume: 'Accès intégral, Concert VIP, Dîner des Élites et plénières en placement premium, badge Diamant.',
    description: 'Accès intégral, Concert pour la vie — VIP, Dîner des Élites et plénières en placement premium, temps privé réservé aux partenaires Diamant, badge Diamant. Kit : pagne mixte, tee-shirt 2026, stylo, bloc-notes, gourde, ventilateur.',
    badge: 'Places limitées', paliers: prix(1_000_000), plateformes: [...accesPartenaire, repasDiamant], quotas: [quotaDiner, quotaRepas],
    kit: [{ produit: pagne, quantite: 1 }, { produit: teeShirt, quantite: 1 }, { produit: stylo, quantite: 1 }, { produit: blocNotes, quantite: 1 }, { produit: gourde, quantite: 1 }, { produit: ventilateur, quantite: 1 }],
    ...aValider, misEnAvant: true, ordreMiseEnAvant: 5, ordre: 5,
  });

  await payload.updateGlobal({ slug: 'reglages-boutique', data: { ventesOuvertes: true } });
  payload.logger.info(`Catalogue importé${DEMO ? ' (avec valeurs de démonstration locales)' : ''}.`);
}
