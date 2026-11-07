/**
 * Tableau de bord du back-office (7 novembre 2026), à la place de l'accueil par défaut de Payload :
 * un écran par rôle (administrateur, éditeur, catalogue, COM Boutique, comptabilité), aux couleurs
 * et à la typographie du site (GBIS v2.1). Composant serveur, calculé à chaque affichage ; styles
 * dans src/app/(payload)/crn-admin-theme.css (préfixe crn-tdb).
 */
import { formaterXAF } from '../../boutique/domaine/src/index.ts';
import { Gutter } from '@payloadcms/ui';
import type { Payload, TypedUser } from 'payload';
import React from 'react';

import { ROLES, type Role } from '../../boutique/lib/acces';
import { donneesTableau, type DonneesTableau } from '../../lib/tableau-de-bord';
import { RUBRIQUES } from '../../lib/roles';
import { Barres, Jauges } from './graphiques';

const fuseau = 'Africa/Libreville';
const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: fuseau });
const moment = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: fuseau });

const LIBELLES_STATUT: Record<string, string> = {
  en_attente: 'En attente',
  payee: 'Payée',
  echouee: 'Échouée',
  expiree: 'Expirée',
  remboursee: 'Remboursée',
  a_verifier: 'À vérifier',
  accepte: 'Accepté',
  refuse_deja_utilise: 'Déjà utilisé',
  refuse_plateforme: 'Non inclus',
  refuse_annule: 'Annulé',
  refuse_invalide: 'Invalide',
  actif: 'Actif',
  suspendu: 'Suspendu',
};

const libelleRole = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;
const quand = (iso: string | null) => (iso ? moment.format(new Date(iso)) : 'Jamais');

function Indicateur({ libelle, valeur, detail, accent = false }: { libelle: string; valeur: React.ReactNode; detail?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`crn-tdb-indicateur${accent ? ' crn-tdb-indicateur--accent' : ''}`}>
      <p className="crn-tdb-indicateur__libelle">{libelle}</p>
      <p className="crn-tdb-indicateur__valeur">{valeur}</p>
      {detail && <p className="crn-tdb-indicateur__detail">{detail}</p>}
    </div>
  );
}

function Carte({ titre, lien, children, large = false }: { titre: string; lien?: { href: string; texte: string }; children: React.ReactNode; large?: boolean }) {
  return (
    <section className={`crn-tdb-carte${large ? ' crn-tdb-carte--large' : ''}`}>
      <header className="crn-tdb-carte__entete">
        <h2>{titre}</h2>
        {lien && <a href={lien.href}>{lien.texte}</a>}
      </header>
      {children}
    </section>
  );
}

const Vide = ({ children }: { children: React.ReactNode }) => <p className="crn-tdb-vide">{children}</p>;

const Statut = ({ valeur }: { valeur: string }) => (
  <span className={`crn-tdb-statut crn-tdb-statut--${valeur}`}>{LIBELLES_STATUT[valeur] ?? valeur}</span>
);

function TableauCommandes({ lignes }: { lignes: DonneesTableau['dernieresCommandes'] }) {
  if (lignes.length === 0) return <Vide>Aucune commande pour le moment.</Vide>;
  return (
    <table className="crn-tdb-table">
      <thead>
        <tr><th>Commande</th><th>Client</th><th>Montant</th><th>Statut</th><th>Date</th></tr>
      </thead>
      <tbody>
        {lignes.map((c) => (
          <tr key={c.numero}>
            <td><a href={`/admin/collections/commandes?where[numero][equals]=${encodeURIComponent(c.numero)}`}>{c.numero}</a></td>
            <td>{c.client}</td>
            <td>{formaterXAF(c.totalXAF)}</td>
            <td><Statut valeur={c.statut} /></td>
            <td>{quand(c.date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VentesParProduit({ d }: { d: DonneesTableau }) {
  if (d.ventes.ventes.length === 0) return <Vide>Aucune vente encaissée pour le moment.</Vide>;
  const max = Math.max(...d.ventes.ventes.map((v) => v.montantXAF));
  return (
    <ul className="crn-tdb-classement">
      {d.ventes.ventes.slice(0, 8).map((v) => (
        <li key={v.produit}>
          <span className="crn-tdb-classement__nom">{v.produit}</span>
          <span className="crn-tdb-classement__barre" style={{ ['--part' as string]: `${Math.max(4, (v.montantXAF / max) * 100)}%` }} aria-hidden="true" />
          <span className="crn-tdb-classement__valeur">{v.quantite} · {formaterXAF(v.montantXAF)}</span>
        </li>
      ))}
    </ul>
  );
}

function PointsAttention({ d }: { d: DonneesTableau }) {
  const a = d.ventes.anomalies;
  const points = [
    a.commandesAVerifier && { texte: `${a.commandesAVerifier} commande(s) à vérifier`, lien: '/admin/collections/commandes?where[statut][equals]=a_verifier' },
    a.quotasAParametrer && { texte: `${a.quotasAParametrer} quota(s) sans capacité : produits « à annoncer »`, lien: '/admin/collections/quotas' },
    a.stocksNonSuivis && { texte: `${a.stocksNonSuivis} variante(s) d’article sans stock renseigné`, lien: '/admin/collections/variantes' },
    a.scansRefuses && { texte: `${a.scansRefuses} scan(s) refusé(s) au total`, lien: '/admin/collections/scans' },
  ].filter(Boolean) as { texte: string; lien: string }[];
  if (points.length === 0) return <Vide>Aucun point d’attention.</Vide>;
  return (
    <ul className="crn-tdb-liste">
      {points.map((p) => (
        <li key={p.texte}><a href={p.lien}>{p.texte}</a></li>
      ))}
    </ul>
  );
}

const Exports = () => (
  <div className="crn-tdb-actions-liste">
    <a className="crn-tdb-bouton crn-tdb-bouton--secondaire" href="/api/boutique/exports/ventes.csv">Ventes (CSV)</a>
    <a className="crn-tdb-bouton crn-tdb-bouton--secondaire" href="/api/boutique/exports/titulaires.csv">Titulaires (CSV)</a>
    <a className="crn-tdb-bouton crn-tdb-bouton--secondaire" href="/api/boutique/exports/consentements.csv">Consentements (CSV)</a>
  </div>
);

const serieVentes = (d: DonneesTableau) =>
  d.ventesParJour.map((j) => ({ libelle: j.jour.slice(8, 10) + '/' + j.jour.slice(5, 7), valeur: j.montantXAF, detail: `${j.commandes} commande(s) · ${formaterXAF(j.montantXAF)}` }));

function Presences({ d }: { d: DonneesTableau }) {
  if (d.ventes.presences.length === 0) return <Vide>Aucun billet émis pour le moment.</Vide>;
  return <Jauges elements={d.ventes.presences.map((p) => ({ libelle: p.plateforme, valeur: p.presents, total: p.droits }))} />;
}

function Ecran({ role, d, ventesOuvertes }: { role: Role; d: DonneesTableau; ventesOuvertes: boolean }) {
  const indicateursVentes = (
    <>
      <Indicateur accent libelle="Chiffre d’affaires encaissé" valeur={formaterXAF(d.ventes.chiffreAffairesXAF)} detail={d.netRecuXAF !== null ? `Net reçu : ${formaterXAF(d.netRecuXAF)}` : 'Montant payé par les clients'} />
      <Indicateur libelle="Commandes payées" valeur={d.ventes.commandes.payee ?? 0} detail={`${d.ventes.commandes.en_attente ?? 0} en attente · ${d.ventes.commandes.a_verifier ?? 0} à vérifier`} />
    </>
  );

  switch (role) {
    case 'editeur':
      return (
        <>
          <div className="crn-tdb-indicateurs">
            {d.contenu.slice(0, 4).map((c) => (
              <a key={c.libelle} className="crn-tdb-indicateur-lien" href={c.lien}><Indicateur libelle={c.libelle} valeur={c.nombre} /></a>
            ))}
          </div>
          <div className="crn-tdb-grille">
            <Carte titre="Dernières modifications du contenu" large>
              {d.derniersContenus.length === 0 ? <Vide>Aucun contenu.</Vide> : (
                <ul className="crn-tdb-liste">
                  {d.derniersContenus.map((c, i) => <li key={i}><a href={c.lien}>{c.titre}</a><span>{c.rubrique} · {quand(c.quand)}</span></li>)}
                </ul>
              )}
            </Carte>
            <Carte titre="Publication">
              <p className="crn-tdb-texte">Chaque enregistrement d’un contenu republie le site public automatiquement (quelques minutes).</p>
            </Carte>
          </div>
        </>
      );

    case 'catalogue':
      return (
        <>
          <div className="crn-tdb-indicateurs">
            <Indicateur accent libelle="Produits en vente" valeur={d.catalogue.enVente} detail={ventesOuvertes ? 'Ventes ouvertes' : 'Ventes fermées'} />
            <Indicateur libelle="Produits « à annoncer »" valeur={d.catalogue.aAnnoncer.length} detail="Capacité ou prix à renseigner" />
            <Indicateur libelle="Variantes sans stock suivi" valeur={d.ventes.anomalies.stocksNonSuivis} />
            <Indicateur libelle="Points relais actifs" valeur={d.catalogue.pointsRelais} />
          </div>
          <div className="crn-tdb-grille">
            <Carte titre="Ventes par produit" large><VentesParProduit d={d} /></Carte>
            <Carte titre="À compléter">
              {d.catalogue.aAnnoncer.length + d.catalogue.stocksBas.length === 0 ? <Vide>Rien à compléter.</Vide> : (
                <ul className="crn-tdb-liste">
                  {d.catalogue.aAnnoncer.map((n) => <li key={n}><a href="/admin/collections/quotas">{n}</a><span>À annoncer</span></li>)}
                  {d.catalogue.stocksBas.map((s) => <li key={s.libelle}><a href="/admin/collections/variantes">{s.libelle}</a><span>Stock bas : {s.restant}</span></li>)}
                </ul>
              )}
            </Carte>
          </div>
        </>
      );

    case 'com_boutique':
      return (
        <>
          <div className="crn-tdb-indicateurs">
            <Indicateur accent libelle="Entrées acceptées aujourd’hui" valeur={d.aujourdHui.acceptes} detail={`${d.aujourdHui.refuses} refus aujourd’hui`} />
            <Indicateur libelle="Entrées au total" valeur={d.entrees} detail={`${d.billetsEmis} billet(s) émis`} />
            <Indicateur libelle="Retraits à remettre" valeur={d.retraitsARemettre} />
          </div>
          <div className="crn-tdb-grille">
            <Carte titre="Présences par séance" large><Presences d={d} /></Carte>
            <Carte titre="Derniers scans" lien={{ href: '/admin/collections/scans', texte: 'Journal des scans' }}>
              {d.derniersScans.length === 0 ? <Vide>Aucun scan pour le moment.</Vide> : (
                <ul className="crn-tdb-liste">
                  {d.derniersScans.map((s, i) => <li key={i}><span><Statut valeur={s.resultat} /> {s.seance}</span><span>{s.poste} · {quand(s.quand)}</span></li>)}
                </ul>
              )}
            </Carte>
          </div>
        </>
      );

    case 'comptabilite':
      return (
        <>
          <div className="crn-tdb-indicateurs">
            {indicateursVentes}
            <Indicateur libelle="Commandes à vérifier" valeur={d.ventes.commandes.a_verifier ?? 0} />
            <Indicateur libelle="Remboursées" valeur={d.remboursees} />
          </div>
          <div className="crn-tdb-grille">
            <Carte titre="Ventes des 14 derniers jours" large><Barres titre="Montant encaissé par jour" elements={serieVentes(d)} /></Carte>
            <Carte titre="Exports"><Exports /></Carte>
            <Carte titre="Dernières commandes" large lien={{ href: '/admin/collections/commandes', texte: 'Toutes les commandes' }}><TableauCommandes lignes={d.dernieresCommandes} /></Carte>
          </div>
        </>
      );

    default:
      return (
        <>
          <div className="crn-tdb-indicateurs">
            {indicateursVentes}
            <Indicateur libelle="Billets émis" valeur={d.billetsEmis} detail={`${d.entrees} entrée(s) scannée(s)`} />
            <Indicateur libelle="Ventes" valeur={ventesOuvertes ? 'Ouvertes' : 'Fermées'} detail={<a href="/admin/globals/reglages-boutique">Réglages de la boutique</a>} />
          </div>
          <div className="crn-tdb-grille">
            <Carte titre="Ventes des 14 derniers jours" large><Barres titre="Montant encaissé par jour" elements={serieVentes(d)} /></Carte>
            <Carte titre="Points d’attention"><PointsAttention d={d} /></Carte>
            <Carte titre="Ventes par produit"><VentesParProduit d={d} /></Carte>
            <Carte titre="Présences par séance"><Presences d={d} /></Carte>
            <Carte titre="Dernières commandes" large lien={{ href: '/admin/collections/commandes', texte: 'Toutes les commandes' }}><TableauCommandes lignes={d.dernieresCommandes} /></Carte>
            <Carte titre="Activité récente" lien={{ href: '/admin/collections/journal-actions', texte: 'Journal' }}>
              {d.activite.length === 0 ? <Vide>Aucune action enregistrée.</Vide> : (
                <ul className="crn-tdb-liste">
                  {d.activite.map((a, i) => <li key={i}><span><strong>{a.qui}</strong> — {a.action} ({a.rubrique})</span><span>{quand(a.quand)}</span></li>)}
                </ul>
              )}
            </Carte>
            <Carte titre="Équipe" lien={{ href: '/admin/collections/users', texte: 'Comptes' }}>
              <ul className="crn-tdb-liste">
                {d.comptes.map((c, i) => <li key={i}><span><strong>{c.nom}</strong> · {libelleRole(c.role)} {c.statut === 'suspendu' && <Statut valeur="suspendu" />}</span><span>Dernière connexion : {quand(c.derniereConnexion)}</span></li>)}
              </ul>
            </Carte>
            <Carte titre="Exports"><Exports /></Carte>
          </div>
        </>
      );
  }
}

const ACTIONS: Record<Role, { href: string; texte: string }[]> = {
  admin: [
    { href: '/admin/collections/users/create', texte: 'Nouveau compte' },
    { href: '/admin/globals/reglages-boutique', texte: 'Réglages de la boutique' },
  ],
  editeur: [
    { href: '/admin/collections/announcements/create', texte: 'Nouvelle annonce' },
    { href: '/admin/collections/speakers/create', texte: 'Nouvel orateur' },
  ],
  catalogue: [
    { href: '/admin/collections/produits/create', texte: 'Nouveau produit' },
    { href: '/admin/collections/quotas', texte: 'Quotas' },
  ],
  com_boutique: [
    { href: '/scan', texte: 'Ouvrir le contrôle d’accès' },
    { href: '/admin/collections/retraits', texte: 'Retraits' },
  ],
  comptabilite: [{ href: '/api/boutique/exports/ventes.csv', texte: 'Exporter les ventes' }],
};

/** Vue d'accueil (admin.components.views.dashboard) : Payload lui passe `payload` et `user`. */
export async function TableauDeBord({ payload, user: compte }: { payload: Payload; user: TypedUser | null }) {
  const user = compte as unknown as { role?: Role; prenom?: string | null; nomAffiche?: string | null; email?: string } | null;
  const role: Role = user?.role ?? 'editeur';
  const [d, reglages] = await Promise.all([donneesTableau(payload, role), payload.findGlobal({ slug: 'reglages-boutique' })]);
  const nom = user?.prenom || user?.nomAffiche || user?.email || '';

  const rubriques = Object.entries(RUBRIQUES)
    .filter(([, roles]) => role === 'admin' || roles.includes(role))
    .map(([slug]) => {
      const c = payload.collections[slug as keyof typeof payload.collections]?.config;
      const g = !c ? payload.config.globals.find((x) => x.slug === slug) : undefined;
      const libelle = c ? c.labels.plural : g?.label;
      return libelle ? { slug, libelle: typeof libelle === 'string' ? libelle : String(Object.values(libelle)[0] ?? slug), href: c ? `/admin/collections/${slug}` : `/admin/globals/${slug}` } : null;
    })
    .filter(Boolean) as { slug: string; libelle: string; href: string }[];

  return (
    <Gutter className="crn-tdb">
      <header className="crn-tdb-bienvenue">
        <div>
          <p className="crn-tdb-bienvenue__date">{date.format(new Date())}</p>
          <h1>Bonjour{nom ? ` ${nom}` : ''}</h1>
          <p className="crn-tdb-bienvenue__role">{libelleRole(role)} · Convention CRN 2026</p>
        </div>
        <div className="crn-tdb-actions-liste">
          {ACTIONS[role].map((a, i) => (
            <a key={a.href} className={`crn-tdb-bouton${i === 0 ? '' : ' crn-tdb-bouton--secondaire'}`} href={a.href}>{a.texte}</a>
          ))}
        </div>
      </header>

      <Ecran role={role} d={d} ventesOuvertes={Boolean(reglages.ventesOuvertes)} />

      <section className="crn-tdb-acces" aria-labelledby="crn-tdb-acces-titre">
        <h2 id="crn-tdb-acces-titre">Accès rapides</h2>
        <ul>
          {rubriques.map((r) => (
            <li key={r.slug}>
              <a href={r.href} data-rubrique={r.slug}>{r.libelle}</a>
            </li>
          ))}
        </ul>
      </section>
    </Gutter>
  );
}

export default TableauDeBord;
