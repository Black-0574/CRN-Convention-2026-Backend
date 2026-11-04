/**
 * Tableau des ventes, en tête de l'accueil du back-office (composant serveur, calculé à chaque
 * affichage) : chiffre d'affaires, ventes par produit, présences par plateforme, anomalies.
 */
import { formaterXAF } from '../../boutique/domaine/src/index.ts';
import type { Payload } from 'payload';
import React from 'react';

import { tableau } from '../../boutique/lib/tableau';

// Couleurs explicites (fond crème, texte noir) : lisible aussi quand l'admin est en thème sombre.
const carte: React.CSSProperties = { background: '#F7F5F0', color: '#101010', border: '1px solid #D8D4CB', borderRadius: 8, padding: '16px 20px' };
const titre: React.CSSProperties = { fontFamily: "'Source Serif 4', Georgia, serif", color: '#1A2C5B', margin: '0 0 12px', fontSize: 20 };
const cellule: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #D8D4CB', textAlign: 'left' };

export async function TableauVentes({ payload }: { payload: Payload }) {
  const t = await tableau(payload);
  const alertes = [
    t.anomalies.commandesAVerifier && `${t.anomalies.commandesAVerifier} commande(s) à vérifier`,
    t.anomalies.quotasAParametrer && `${t.anomalies.quotasAParametrer} quota(s) sans capacité (ventes bloquées)`,
    t.anomalies.stocksNonSuivis && `${t.anomalies.stocksNonSuivis} variante(s) sans stock renseigné`,
    t.anomalies.scansRefuses && `${t.anomalies.scansRefuses} scan(s) refusé(s)`,
  ].filter(Boolean);

  return (
    <section style={{ display: 'grid', gap: 16, marginBottom: 32 }} aria-label="Tableau des ventes">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div style={carte}>
          <div style={{ color: '#6B6B6B' }}>Chiffre d’affaires encaissé</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1A2C5B' }}>{formaterXAF(t.chiffreAffairesXAF)}</div>
        </div>
        <div style={carte}>
          <div style={{ color: '#6B6B6B' }}>Commandes</div>
          <div style={{ fontSize: 18 }}>
            {(t.commandes.payee ?? 0)} payée(s) · {(t.commandes.en_attente ?? 0)} en attente · {(t.commandes.expiree ?? 0) + (t.commandes.echouee ?? 0)} non abouties
          </div>
        </div>
        <div style={{ ...carte, borderColor: alertes.length ? '#B8963E' : '#D8D4CB' }}>
          <div style={{ color: '#6B6B6B' }}>Points d’attention</div>
          {alertes.length ? <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{alertes.map((a) => <li key={String(a)}>{a}</li>)}</ul> : <div>Aucun</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div style={carte}>
          <h2 style={titre}>Ventes par produit</h2>
          {t.ventes.length === 0 ? (
            <p>Aucune vente encaissée.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={cellule}>Produit</th><th style={cellule}>Qté</th><th style={cellule}>Montant</th></tr></thead>
              <tbody>{t.ventes.map((v) => <tr key={v.produit}><td style={cellule}>{v.produit}</td><td style={cellule}>{v.quantite}</td><td style={cellule}>{formaterXAF(v.montantXAF)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        <div style={carte}>
          <h2 style={titre}>Présences par plateforme</h2>
          {t.presences.length === 0 ? (
            <p>Aucun billet émis.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={cellule}>Plateforme</th><th style={cellule}>Présents / billets</th></tr></thead>
              <tbody>{t.presences.map((p) => <tr key={p.plateforme}><td style={cellule}>{p.plateforme}</td><td style={cellule}>{p.presents} / {p.droits}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
      <p style={{ margin: 0, color: 'inherit' }}>
        Exports CSV : <a href="/api/boutique/exports/ventes.csv">ventes</a> · <a href="/api/boutique/exports/titulaires.csv">titulaires</a> · <a href="/api/boutique/exports/consentements.csv">consentements</a>
      </p>
    </section>
  );
}

export default TableauVentes;
