import { describe, expect, it } from 'vitest';
import { appliquerScan, genererDroits } from '../src/droits.ts';
import { creerJeton, empreinteJeton, jetonAuthentique } from '../src/jetons.ts';

const SECRET = 'secret-de-test-suffisamment-long-0123456789';

describe('jetons de billet (QR)', () => {
  it('un jeton créé est authentique, sans donnée personnelle et de taille fixe', () => {
    const j = creerJeton(SECRET);
    expect(j).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
    expect(jetonAuthentique(j, SECRET)).toBe(true);
  });
  it('deux jetons sont toujours différents', () => {
    const lot = new Set(Array.from({ length: 1000 }, () => creerJeton(SECRET)));
    expect(lot.size).toBe(1000);
  });
  it('rejette une signature modifiée, un autre secret, une forme invalide', () => {
    const j = creerJeton(SECRET);
    const [id, sig] = j.split('.') as [string, string];
    const altere = `${id}.${sig.startsWith('A') ? 'B' : 'A'}${sig.slice(1)}`;
    expect(jetonAuthentique(altere, SECRET)).toBe(false);
    expect(jetonAuthentique(j, `${SECRET}-autre`)).toBe(false);
    expect(jetonAuthentique('nimporte-quoi', SECRET)).toBe(false);
    expect(jetonAuthentique(`${id}.${sig}.x`, SECRET)).toBe(false);
  });
  it('refuse un secret trop court', () => {
    expect(() => creerJeton('court')).toThrow();
  });
  it('l’empreinte stockée est stable et ne révèle pas le jeton', () => {
    const j = creerJeton(SECRET);
    expect(empreinteJeton(j)).toBe(empreinteJeton(j));
    expect(empreinteJeton(j)).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinteJeton(j)).not.toContain(j.split('.')[0]);
  });
});

describe('droits d’accès par plateforme', () => {
  const instant = new Date('2026-12-08T08:00:00Z');
  const droits = genererDroits(['academie-classe-1-2026-12-08', 'concert-vip', 'concert-vip']);

  it('un droit par plateforme, sans doublon', () => {
    expect(droits).toEqual([
      { plateforme: 'academie-classe-1-2026-12-08', statut: 'valide' },
      { plateforme: 'concert-vip', statut: 'valide' },
    ]);
  });

  it('premier scan accepté : seul le droit de cette plateforme est consommé', () => {
    const r = appliquerScan(droits, { plateforme: 'concert-vip', poste: 'nomad-1', instant, authentique: true });
    expect(r.scan.resultat).toBe('accepte');
    expect(r.droits.find((d) => d.plateforme === 'concert-vip')?.statut).toBe('consomme');
    expect(r.droits.find((d) => d.plateforme === 'academie-classe-1-2026-12-08')?.statut).toBe('valide');
  });

  it('second scan du même droit refusé, avec le moment et le poste du premier passage', () => {
    const premier = appliquerScan(droits, { plateforme: 'concert-vip', poste: 'nomad-1', instant, authentique: true });
    const second = appliquerScan(premier.droits, {
      plateforme: 'concert-vip',
      poste: 'nomad-2',
      instant: new Date(instant.getTime() + 60_000),
      authentique: true,
    });
    expect(second.scan).toMatchObject({ resultat: 'refuse_deja_utilise', dejaConsommeA: instant, dejaConsommePar: 'nomad-1' });
    expect(second.droits).toEqual(premier.droits);
  });

  it('plateforme non incluse, droit annulé et jeton non authentique : refusés et journalisés', () => {
    expect(appliquerScan(droits, { plateforme: 'diner-des-elites', poste: 'p', instant, authentique: true }).scan.resultat).toBe('refuse_plateforme');
    const annules = droits.map((d) => ({ ...d, statut: 'annule' as const }));
    expect(appliquerScan(annules, { plateforme: 'concert-vip', poste: 'p', instant, authentique: true }).scan.resultat).toBe('refuse_annule');
    expect(appliquerScan(droits, { plateforme: 'concert-vip', poste: 'p', instant, authentique: false }).scan.resultat).toBe('refuse_invalide');
  });
});
