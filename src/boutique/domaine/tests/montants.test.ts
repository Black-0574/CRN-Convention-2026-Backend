import { describe, expect, it } from 'vitest';
import { formaterEUR, formaterXAF, xafVersEurArrondi } from '../src/montants.ts';

const FINE = ' ';
const INSECABLE = ' ';

describe('montants en F CFA', () => {
  it('espace fine entre les milliers, espace insécable avant l’unité, sans décimales', () => {
    expect(formaterXAF(150_000)).toBe(`150${FINE}000${INSECABLE}F${INSECABLE}CFA`);
    expect(formaterXAF(1_000_000)).toBe(`1${FINE}000${FINE}000${INSECABLE}F${INSECABLE}CFA`);
    expect(formaterXAF(5_000)).toBe(`5${FINE}000${INSECABLE}F${INSECABLE}CFA`);
    expect(formaterXAF(600)).toBe(`600${INSECABLE}F${INSECABLE}CFA`);
  });
  it('refuse les montants non entiers ou négatifs', () => {
    expect(() => formaterXAF(1500.5)).toThrow();
    expect(() => formaterXAF(-1)).toThrow();
  });
});

describe('euros à la parité fixe (1 € = 655,957 F CFA)', () => {
  it('arrondi à l’euro le plus proche', () => {
    expect(xafVersEurArrondi(655_957)).toBe(1000);
    expect(xafVersEurArrondi(150_000)).toBe(229); // 228,67
    expect(xafVersEurArrondi(5_000)).toBe(8); // 7,62
    expect(xafVersEurArrondi(10_000)).toBe(15); // 15,24
  });
  it('format « 229 € »', () => {
    expect(formaterEUR(150_000)).toBe(`229${INSECABLE}€`);
    expect(formaterEUR(1_000_000)).toBe(`1${FINE}524${INSECABLE}€`);
  });
});
