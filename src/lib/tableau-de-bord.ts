/**
 * Données du tableau de bord du back-office (7 novembre 2026), par rôle. Lecture seule, calculées
 * à chaque affichage ; reprend `tableau()` (src/boutique/lib/tableau.ts) pour le chiffre
 * d'affaires, les ventes par produit, les présences et les points d'attention. Aucune donnée
 * inventée : une série vide s'affiche « aucune donnée ».
 */
import type { Payload } from 'payload';

import type { Role } from '../boutique/lib/acces';
import { catalogue } from '../boutique/lib/catalogue';
import { tableau, type Tableau } from '../boutique/lib/tableau';

/** Jour (AAAA-MM-JJ) à l'heure de Libreville (UTC+1, sans heure d'été). */
export const jourLibreville = (d: Date | string) => new Date(new Date(d).getTime() + 3600_000).toISOString().slice(0, 10);

const JOURS_SERIE = 14;
const TOUT = { limit: 10_000, depth: 0, pagination: false } as const;

export interface LigneCommande {
  numero: string;
  client: string;
  totalXAF: number;
  statut: string;
  date: string;
}

export interface Activite {
  quand: string;
  qui: string;
  action: string;
  rubrique: string;
}

export interface DonneesTableau {
  ventes: Tableau;
  ventesParJour: { jour: string; montantXAF: number; commandes: number }[];
  dernieresCommandes: LigneCommande[];
  billetsEmis: number;
  entrees: number;
  aujourdHui: { acceptes: number; refuses: number };
  retraitsARemettre: number;
  netRecuXAF: number | null;
  remboursees: number;
  catalogue: { enVente: number; aAnnoncer: string[]; stocksBas: { libelle: string; restant: number }[]; pointsRelais: number };
  contenu: { libelle: string; nombre: number; lien: string }[];
  derniersContenus: { titre: string; rubrique: string; lien: string; quand: string }[];
  activite: Activite[];
  comptes: { nom: string; role: string; statut: string; derniereConnexion: string | null }[];
  derniersScans: { quand: string; seance: string; resultat: string; poste: string }[];
}

const montant = (detail: string | null | undefined, cle: string) => {
  const m = detail?.match(new RegExp(`${cle} ([\\d\\s\\u202f\\u00a0]+) F CFA`));
  return m ? Number(m[1]!.replace(/\D/g, '')) : null;
};

export async function donneesTableau(payload: Payload, role: Role): Promise<DonneesTableau> {
  const voitVentes = role === 'admin' || role === 'comptabilite' || role === 'catalogue' || role === 'com_boutique';
  const ventes = voitVentes
    ? await tableau(payload)
    : { chiffreAffairesXAF: 0, commandes: {}, ventes: [], presences: [], anomalies: { commandesAVerifier: 0, scansRefuses: 0, stocksNonSuivis: 0, quotasAParametrer: 0 } };

  // Ventes par jour (14 derniers jours, Libreville) et dernières commandes.
  const commandes = voitVentes ? (await payload.find({ collection: 'commandes', ...TOUT, sort: '-createdAt' })).docs : [];
  const auj = jourLibreville(new Date());
  const jours = Array.from({ length: JOURS_SERIE }, (_, i) => jourLibreville(new Date(Date.now() - (JOURS_SERIE - 1 - i) * 86_400_000)));
  const serie = new Map(jours.map((j) => [j, { jour: j, montantXAF: 0, commandes: 0 }]));
  let net = 0;
  let netConnu = false;
  for (const c of commandes) {
    if (c.statut !== 'payee') continue;
    const j = serie.get(jourLibreville(c.paiement?.payeeA ?? c.updatedAt));
    if (j) {
      j.montantXAF += c.totalXAF;
      j.commandes++;
    }
    const n = montant(c.paiement?.detail, 'net reçu');
    if (n !== null) {
      net += n;
      netConnu = true;
    }
  }
  const dernieresCommandes = commandes.slice(0, 6).map((c) => ({
    numero: c.numero,
    client: [c.prenom, c.nom].filter(Boolean).join(' '),
    totalXAF: c.totalXAF,
    statut: c.statut,
    date: c.createdAt,
  }));

  // Billets, entrées, scans du jour, retraits.
  const voitControle = role === 'admin' || role === 'com_boutique';
  const compter = (collection: 'titulaires' | 'scans' | 'retraits', where?: object) =>
    payload.count({ collection, ...(where ? { where: where as never } : {}) }).then((r) => r.totalDocs);
  const debutJour = new Date(`${auj}T00:00:00+01:00`).toISOString();
  const [billetsEmis, entrees, acceptes, refuses, retraitsARemettre] = voitVentes
    ? await Promise.all([
        compter('titulaires'),
        compter('scans', { resultat: { equals: 'accepte' } }),
        compter('scans', { resultat: { equals: 'accepte' }, createdAt: { greater_than_equal: debutJour } }),
        compter('scans', { resultat: { not_equals: 'accepte' }, createdAt: { greater_than_equal: debutJour } }),
        compter('retraits', { statut: { not_equals: 'remis' } }),
      ])
    : [0, 0, 0, 0, 0];

  const derniersScans = voitControle
    ? (await payload.find({ collection: 'scans', limit: 6, depth: 1, sort: '-createdAt' })).docs.map((s) => ({
        quand: s.createdAt,
        seance: typeof s.plateforme === 'object' ? s.plateforme.nom : '',
        resultat: s.resultat,
        poste: s.poste,
      }))
    : [];

  // Catalogue : produits en vente, « à annoncer », stocks bas, points relais.
  const voitCatalogue = role === 'admin' || role === 'catalogue';
  let vueCatalogue: DonneesTableau['catalogue'] = { enVente: 0, aAnnoncer: [], stocksBas: [], pointsRelais: 0 };
  if (voitCatalogue) {
    const vues = (await catalogue(payload)).filter((v) => !v.reserveTests);
    const variantes = (await payload.find({ collection: 'variantes', where: { actif: { equals: true }, stock: { exists: true } }, ...TOUT, depth: 1 })).docs;
    vueCatalogue = {
      enVente: vues.filter((v) => v.prixXAF !== null && !v.indisponible).length,
      aAnnoncer: vues.filter((v) => v.indisponible).map((v) => v.nom),
      stocksBas: variantes
        .map((v) => ({ v, restant: (v.stock ?? 0) - (v.stockVendu ?? 0) - (v.stockReserve ?? 0) }))
        .filter(({ v, restant }) => restant <= (v.seuilAlerte ?? 0))
        .map(({ v, restant }) => ({ libelle: `${typeof v.produit === 'object' ? v.produit.nom : 'Produit'} — ${v.libelle}`, restant })),
      pointsRelais: (await payload.count({ collection: 'points-livraison', where: { actif: { equals: true } } })).totalDocs,
    };
  }

  // Contenu du site : volumes et dernières modifications.
  const voitContenu = role === 'admin' || role === 'editeur';
  const RUBRIQUES_CONTENU = [
    { slug: 'speakers', libelle: 'Orateurs', titre: 'nom' },
    { slug: 'artists', libelle: 'Artistes', titre: 'nom' },
    { slug: 'announcements', libelle: 'Annonces', titre: 'titre' },
    { slug: 'program-days', libelle: 'Jours de programme', titre: 'label' },
    { slug: 'faq', libelle: 'Questions de la FAQ', titre: 'question' },
    { slug: 'media', libelle: 'Médias', titre: 'filename' },
  ] as const;
  const contenu = voitContenu
    ? await Promise.all(
        RUBRIQUES_CONTENU.map(async (r) => ({ libelle: r.libelle, nombre: (await payload.count({ collection: r.slug })).totalDocs, lien: `/admin/collections/${r.slug}` })),
      )
    : [];
  const derniersContenus = voitContenu
    ? (
        await Promise.all(
          RUBRIQUES_CONTENU.slice(0, 5).map(async (r) =>
            (await payload.find({ collection: r.slug, limit: 3, depth: 0, sort: '-updatedAt' })).docs.map((d) => ({
              titre: String((d as unknown as Record<string, unknown>)[r.titre] ?? `#${d.id}`),
              rubrique: r.libelle,
              lien: `/admin/collections/${r.slug}/${d.id}`,
              quand: d.updatedAt,
            })),
          ),
        )
      )
        .flat()
        .sort((a, b) => b.quand.localeCompare(a.quand))
        .slice(0, 6)
    : [];

  // Administration : activité récente et comptes.
  const activite =
    role === 'admin'
      ? (await payload.find({ collection: 'journal-actions', limit: 8, depth: 1, sort: '-createdAt' })).docs.map((a) => ({
          quand: a.createdAt,
          qui: typeof a.utilisateur === 'object' && a.utilisateur ? (a.utilisateur.nomAffiche ?? a.utilisateur.email) : 'Serveur',
          action: a.action,
          rubrique: a.collection,
        }))
      : [];
  const comptes =
    role === 'admin'
      ? (await payload.find({ collection: 'users', ...TOUT, sort: '-derniereConnexion' })).docs.map((u) => ({
          nom: u.nomAffiche || u.email,
          role: u.role,
          statut: u.statut,
          derniereConnexion: u.derniereConnexion ?? null,
        }))
      : [];

  return {
    ventes,
    ventesParJour: [...serie.values()],
    dernieresCommandes,
    billetsEmis,
    entrees,
    aujourdHui: { acceptes, refuses },
    retraitsARemettre,
    netRecuXAF: netConnu ? net : null,
    remboursees: (ventes.commandes as Record<string, number>).remboursee ?? 0,
    catalogue: vueCatalogue,
    contenu,
    derniersContenus,
    activite,
    comptes,
    derniersScans,
  };
}
