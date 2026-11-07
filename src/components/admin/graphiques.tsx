/**
 * Graphiques du tableau de bord, en SVG maison (aucune bibliothèque, aucun service externe) :
 * barres verticales et jauges. Couleurs de la charte (bleu nuit, or) ; chaque graphique est doublé
 * d'un tableau de valeurs pour les lecteurs d'écran.
 */
import React from 'react';

type Element = { libelle: string; valeur: number; detail?: string };

export function Barres({ titre, elements }: { titre: string; elements: Element[] }) {
  const max = Math.max(0, ...elements.map((e) => e.valeur));
  if (max === 0) return <p className="crn-tdb-vide">Aucune vente sur la période.</p>;
  const largeur = 640;
  const hauteur = 200;
  const pas = largeur / elements.length;
  const barre = Math.min(28, pas * 0.6);
  return (
    <figure className="crn-tdb-barres">
      <svg viewBox={`0 0 ${largeur} ${hauteur + 28}`} role="img" aria-label={titre} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <line key={p} x1="0" x2={largeur} y1={hauteur - hauteur * p} y2={hauteur - hauteur * p} className="crn-tdb-barres__grille" />
        ))}
        {elements.map((e, i) => {
          const h = Math.max(e.valeur > 0 ? 4 : 0, (e.valeur / max) * (hauteur - 8));
          const x = i * pas + (pas - barre) / 2;
          return (
            <g key={e.libelle}>
              <rect x={x} y={hauteur - h} width={barre} height={h} rx="6" className={e.valeur === max ? 'crn-tdb-barres__barre crn-tdb-barres__barre--max' : 'crn-tdb-barres__barre'}>
                <title>{`${e.libelle} : ${e.detail ?? e.valeur}`}</title>
              </rect>
              {i % 2 === 0 && (
                <text x={i * pas + pas / 2} y={hauteur + 22} textAnchor="middle" className="crn-tdb-barres__libelle">
                  {e.libelle}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="crn-sr">
        <caption>{titre}</caption>
        <tbody>
          {elements.map((e) => (
            <tr key={e.libelle}><th scope="row">{e.libelle}</th><td>{e.detail ?? e.valeur}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function Jauges({ elements }: { elements: { libelle: string; valeur: number; total: number }[] }) {
  return (
    <ul className="crn-tdb-jauges">
      {elements.map((e) => {
        const part = e.total > 0 ? Math.round((e.valeur / e.total) * 100) : 0;
        return (
          <li key={e.libelle}>
            <div className="crn-tdb-jauges__entete">
              <span>{e.libelle}</span>
              <span>{`${e.valeur} / ${e.total} · ${part} %`}</span>
            </div>
            <div className="crn-tdb-jauges__piste" role="progressbar" aria-valuenow={part} aria-valuemin={0} aria-valuemax={100} aria-label={e.libelle}>
              <span style={{ width: `${part}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
