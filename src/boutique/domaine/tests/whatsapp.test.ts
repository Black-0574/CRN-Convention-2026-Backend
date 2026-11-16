import { describe, expect, it } from 'vitest';
import { lienWhatsApp, messageBillets, numeroWhatsApp } from '../src/whatsapp.ts';

// Billets envoyés par WhatsApp (Commanditaire, 16 novembre 2026).
describe('numéro WhatsApp', () => {
  it('complète les numéros locaux du Gabon par +241', () => {
    expect(numeroWhatsApp('062 70 51 83')).toBe('24162705183');
    expect(numeroWhatsApp('77 12 34 56')).toBe('24177123456');
  });

  it('garde les numéros internationaux', () => {
    expect(numeroWhatsApp('+241 62 70 51 83')).toBe('24162705183');
    expect(numeroWhatsApp('0033 6 12 34 56 78')).toBe('33612345678');
  });

  it('refuse un numéro inexploitable', () => {
    expect(numeroWhatsApp('')).toBeNull();
    expect(numeroWhatsApp('12345')).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
  });
});

describe('message et lien WhatsApp', () => {
  const message = messageBillets({
    prenom: 'Awa',
    numero: 'CRN-ABC1234',
    totalXAF: 150_000,
    billets: [{ titulaire: 'Awa Essono', produit: 'Pass Convention Intégral', lien: 'https://admin.exemple/billet?sig=1' }],
    suivi: 'https://site.exemple/boutique/suivi?commande=CRN-ABC1234&t=x',
  });

  it('reprend le montant, chaque billet et le suivi, en typographie française', () => {
    expect(message).toContain('150 000 F CFA');
    expect(message).toContain('Awa Essono — Pass Convention Intégral : https://admin.exemple/billet?sig=1');
    expect(message).toContain('Merci !');
    expect(message).not.toMatch(/ [:;!?]/);
  });

  it('ouvre WhatsApp vers le numéro, avec le message encodé', () => {
    const lien = lienWhatsApp('24162705183', message);
    expect(lien.startsWith('https://wa.me/24162705183?text=')).toBe(true);
    expect(decodeURIComponent(lien.split('text=')[1]!)).toBe(message);
    expect(lienWhatsApp(null, 'x')).toBe('https://wa.me/?text=x');
  });
});
