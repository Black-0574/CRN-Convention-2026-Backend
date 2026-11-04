/**
 * Tableau de bord (prompt maître, « Billets et contrôle d'accès ») : ventes par produit,
 * présences par plateforme, anomalies. Calculé à la demande (temps réel) par l'API locale.
 */
import type { Payload } from 'payload';

export interface Tableau {
  chiffreAffairesXAF: number;
  commandes: Record<string, number>;
  ventes: { produit: string; quantite: number; montantXAF: number }[];
  presences: { plateforme: string; presents: number; droits: number }[];
  anomalies: { commandesAVerifier: number; scansRefuses: number; stocksNonSuivis: number; quotasAParametrer: number };
}

export async function tableau(payload: Payload): Promise<Tableau> {
  const commandes = (await payload.find({ collection: 'commandes', limit: 10000, depth: 0, pagination: false })).docs;
  const parStatut: Record<string, number> = {};
  const ventes = new Map<string, { quantite: number; montantXAF: number }>();
  let ca = 0;
  for (const c of commandes) {
    parStatut[c.statut] = (parStatut[c.statut] ?? 0) + 1;
    if (c.statut !== 'payee') continue;
    ca += c.totalXAF;
    for (const l of c.lignes ?? []) {
      const nom = l.kitDe ? `${l.libelle.replace(/ \(inclus.*$/, '')} (kits)` : l.libelle;
      const v = ventes.get(nom) ?? { quantite: 0, montantXAF: 0 };
      v.quantite += l.quantite;
      v.montantXAF += l.quantite * l.prixUnitaireXAF;
      ventes.set(nom, v);
    }
  }

  const plateformes = (await payload.find({ collection: 'plateformes', limit: 500, depth: 0, pagination: false, sort: 'debut' })).docs;
  const presences = [];
  for (const p of plateformes) {
    const droits = (await payload.count({ collection: 'droits-acces', where: { plateforme: { equals: p.id }, statut: { not_equals: 'annule' } } })).totalDocs;
    if (droits === 0) continue;
    const presents = (await payload.count({ collection: 'droits-acces', where: { plateforme: { equals: p.id }, statut: { equals: 'consomme' } } })).totalDocs;
    presences.push({ plateforme: p.nom, presents, droits });
  }

  return {
    chiffreAffairesXAF: ca,
    commandes: parStatut,
    ventes: [...ventes].map(([produit, v]) => ({ produit, ...v })).sort((a, b) => b.montantXAF - a.montantXAF),
    presences,
    anomalies: {
      commandesAVerifier: parStatut.a_verifier ?? 0,
      scansRefuses: (await payload.count({ collection: 'scans', where: { resultat: { not_equals: 'accepte' } } })).totalDocs,
      // Articles physiques seulement : les billets sont limités par leurs quotas, pas par un stock.
      stocksNonSuivis: (
        await payload.count({ collection: 'variantes', where: { stock: { exists: false }, actif: { equals: true }, 'produit.type': { equals: 'physique' } } })
      ).totalDocs,
      quotasAParametrer: (await payload.count({ collection: 'quotas', where: { capacite: { exists: false } } })).totalDocs,
    },
  };
}

const champCsv = (v: unknown) => {
  const t = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** CSV (séparateur « ; », lisible directement par Excel en français), avec BOM UTF-8. */
export const csv = (entetes: string[], lignes: unknown[][]) =>
  `﻿${[entetes, ...lignes].map((l) => l.map(champCsv).join(';')).join('\r\n')}\r\n`;
