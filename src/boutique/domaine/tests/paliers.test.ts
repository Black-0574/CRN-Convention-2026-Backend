import { describe, expect, it } from 'vitest';
import {
  palierDepuisJours,
  palierEnVigueur,
  prixAEncaisser,
  prochaineBascule,
  verifierPaliers,
} from '../src/paliers.ts';
import { jourLibreville, minuitLibreville } from '../src/temps.ts';

// Grille de TEST reprenant la structure du Pass Convention Intégral décrite par le prompt maître
// (120 000 → 150 000 → 180 000). Données de test uniquement : la grille publiée viendra de
// docs/grille-tarifaire.md une fois validée par le CRN.
const integral = [
  { prixXAF: 120_000, du: '2026-10-25', au: '2026-10-31' },
  { prixXAF: 150_000, du: '2026-11-01', au: '2026-11-30' },
  { prixXAF: 180_000, du: '2026-12-01' },
].map(palierDepuisJours);

// Heure de Libreville → instant UTC (UTC+1).
const libreville = (iso: string) => new Date(`${iso}+01:00`);

describe('heure de Libreville', () => {
  it('00h00 à Libreville = 23h00 UTC la veille', () => {
    expect(minuitLibreville('2026-12-01').toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });
  it('le jour de Libreville bascule à minuit local, pas à minuit UTC', () => {
    expect(jourLibreville(new Date('2026-11-30T22:59:59Z'))).toBe('2026-11-30');
    expect(jourLibreville(new Date('2026-11-30T23:00:00Z'))).toBe('2026-12-01');
  });
  it('refuse un jour impossible', () => {
    expect(() => minuitLibreville('2026-02-30')).toThrow();
    expect(() => minuitLibreville('30/11/2026')).toThrow();
  });
});

describe('bascule tarifaire (horloge simulée, heure de Libreville)', () => {
  it('30 novembre 23h59 : palier de novembre', () => {
    expect(palierEnVigueur(integral, libreville('2026-11-30T23:59:00'))?.prixXAF).toBe(150_000);
  });
  it('30 novembre 23h59:59.999 : encore le palier de novembre', () => {
    expect(palierEnVigueur(integral, libreville('2026-11-30T23:59:59.999'))?.prixXAF).toBe(150_000);
  });
  it('1er décembre 00h00 : palier de décembre', () => {
    expect(palierEnVigueur(integral, libreville('2026-12-01T00:00:00'))?.prixXAF).toBe(180_000);
  });
  it('31 octobre 23h59 puis 1er novembre 00h00', () => {
    expect(palierEnVigueur(integral, libreville('2026-10-31T23:59:00'))?.prixXAF).toBe(120_000);
    expect(palierEnVigueur(integral, libreville('2026-11-01T00:00:00'))?.prixXAF).toBe(150_000);
  });
  it('avant l’ouverture : aucun prix (produit non vendable)', () => {
    expect(palierEnVigueur(integral, libreville('2026-10-24T23:59:00'))).toBeNull();
  });
  it('dernier palier sans date de fin : toujours applicable', () => {
    expect(palierEnVigueur(integral, libreville('2026-12-13T12:00:00'))?.prixXAF).toBe(180_000);
  });
});

describe('prochaine bascule (compte à rebours)', () => {
  it('le 4 novembre : bascule le 1er décembre à 00h00 de Libreville', () => {
    expect(prochaineBascule(integral, libreville('2026-11-04T10:00:00'))?.toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });
  it('après la dernière bascule : aucune', () => {
    expect(prochaineBascule(integral, libreville('2026-12-02T00:00:00'))).toBeNull();
  });
});

describe('prix garanti pendant la réservation', () => {
  const panier = { prixXAF: 150_000, garantiJusqua: libreville('2026-12-01T00:10:00') };
  it('paiement confirmé avant la fin de la réservation : prix du panier, même après la bascule', () => {
    expect(prixAEncaisser(integral, panier, libreville('2026-12-01T00:05:00'))).toBe(150_000);
  });
  it('réservation expirée : palier en vigueur à la confirmation', () => {
    expect(prixAEncaisser(integral, panier, libreville('2026-12-01T00:11:00'))).toBe(180_000);
  });
});

describe('cohérence d’une grille', () => {
  it('la grille de test est cohérente', () => {
    expect(verifierPaliers(integral)).toEqual([]);
  });
  it('détecte un chevauchement, une fin avant le début et un prix invalide', () => {
    const erreurs = verifierPaliers([
      palierDepuisJours({ prixXAF: 100, du: '2026-11-01', au: '2026-11-30' }),
      palierDepuisJours({ prixXAF: 200, du: '2026-11-15' }),
      { prixXAF: 12.5, debut: minuitLibreville('2026-12-10'), fin: minuitLibreville('2026-12-09') },
    ]);
    expect(erreurs.join(' ')).toMatch(/chevauchent/);
    expect(erreurs.join(' ')).toMatch(/fin avant le début/);
    expect(erreurs.join(' ')).toMatch(/prix invalide/);
  });
});
