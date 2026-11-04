import { describe, expect, it } from 'vitest';
import { confirmer, disponible, finReservation, liberer, reserver, type Quota } from '../src/quotas.ts';

describe('quotas (F03)', () => {
  const diner: Quota = { capacite: 50, vendus: 0, reserves: 0 };

  it('200 demandes d’une place sur 50 : exactement 50 réservations acceptées', () => {
    let q = diner;
    let acceptees = 0;
    for (let i = 0; i < 200; i++) {
      const r = reserver(q, 1);
      if (r) {
        q = r;
        acceptees++;
      }
    }
    expect(acceptees).toBe(50);
    expect(disponible(q)).toBe(0);
  });

  it('une réservation trop grande est refusée sans rien modifier', () => {
    expect(reserver({ capacite: 50, vendus: 48, reserves: 1 }, 2)).toBeNull();
  });

  it('confirmation : réservées → vendues ; libération : retour à la vente', () => {
    const r = reserver(diner, 3)!;
    expect(confirmer(r, 3)).toEqual({ capacite: 50, vendus: 3, reserves: 0 });
    expect(disponible(liberer(r, 3))).toBe(50);
  });

  it('refuse les incohérences', () => {
    expect(() => reserver(diner, 0)).toThrow();
    expect(() => confirmer(diner, 1)).toThrow();
    expect(() => liberer(diner, 1)).toThrow();
  });

  it('réservation de 15 minutes', () => {
    expect(finReservation(new Date('2026-11-10T10:00:00Z')).toISOString()).toBe('2026-11-10T10:15:00.000Z');
  });
});
