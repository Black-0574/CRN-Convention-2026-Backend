'use client';

/*
  Caisse de la COM Boutique (paiement en espèces, Commanditaire, 16 novembre 2026).
  Le client a commandé en ligne et choisi « Espèces » ; il donne son numéro de commande (ou son
  téléphone, son nom). Le caissier, connecté avec son compte nominatif (rôle COM Boutique), retrouve
  la commande, reçoit le montant exact et valide l'encaissement après confirmation. Les billets
  sont aussitôt émis : envoyés par e-mail si le client l'a choisi, et par WhatsApp d'un toucher
  (WhatsApp s'ouvre sur ce téléphone avec le message et les liens des billets déjà rédigés).
*/
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { formaterXAF } from '../../../boutique/domaine/src/montants.ts';
import { lienWhatsApp, numeroWhatsApp } from '../../../boutique/domaine/src/whatsapp.ts';
import { CopierMessage } from '../../../components/CopierMessage';

type Commande = {
  numero: string;
  mode: 'especes' | 'code_marchand';
  codeMarchand: { operateur: string; codeCommercant: string; idTransaction: string | null; preuve: boolean; preuveRecueLe: string | null } | null;
  statut: string;
  expiree: boolean;
  client: string;
  telephone: string;
  email: string | null;
  canalBillets: 'email' | 'whatsapp' | 'email_whatsapp';
  totalXAF: number;
  echeance: string | null;
  payeeA: string | null;
  lignes: { libelle: string; quantite: number; montantXAF: number; inclus: boolean }[];
};
type Encaissement = {
  commande: Commande;
  billets: { numero: string; titulaire: string; produit: string }[];
  message: string;
  whatsapp: { numero: string | null };
};

const quand = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville' });

function etiquette(c: Commande): string {
  if (c.statut === 'payee') return `Encaissée${c.payeeA ? ` le ${quand.format(new Date(c.payeeA))}` : ''}`;
  if (c.statut === 'en_attente' && c.codeMarchand) return c.expiree ? 'Délai dépassé' : c.codeMarchand.preuve ? 'Preuve reçue : à vérifier' : 'Preuve attendue';
  if (c.statut === 'en_attente') return c.expiree ? 'Délai dépassé' : 'À encaisser';
  return { expiree: 'Délai dépassé', echouee: 'Annulée', remboursee: 'Remboursée', a_verifier: 'À vérifier' }[c.statut] ?? c.statut;
}

const aEncaisser = (c: Commande) => c.statut === 'en_attente' && !c.expiree;
const veutWhatsApp = (c: Commande) => c.canalBillets !== 'email';

export function Caisse() {
  const [etat, setEtat] = useState<'chargement' | 'connexion' | 'caisse'>('chargement');
  const [messageConnexion, setMessageConnexion] = useState('');
  const [recherche, setRecherche] = useState('');
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [journee, setJournee] = useState({ nombre: 0, totalXAF: 0 });
  const [choisie, setChoisie] = useState<Commande | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState<Encaissement | null>(null);
  const [numeroWa, setNumeroWa] = useState('');
  const champRecherche = useRef<HTMLInputElement>(null);

  const charger = useCallback(async (q = '') => {
    let res: Response;
    try {
      res = await fetch(`/api/boutique/caisse/commandes?q=${encodeURIComponent(q)}`, { credentials: 'include' });
    } catch {
      return setErreur('Réseau indisponible : vérifiez la connexion du poste, puis réessayez.');
    }
    if (res.status === 401 || res.status === 403) return setEtat('connexion');
    const d: { commandes: Commande[]; journee: { nombre: number; totalXAF: number } } = await res.json();
    setCommandes(d.commandes);
    setJournee(d.journee);
    setErreur('');
    setEtat('caisse');
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const connecter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    let res: Response;
    try {
      res = await fetch('/api/users/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
    } catch {
      return setMessageConnexion('Connexion impossible : vérifiez le réseau du poste, puis réessayez.');
    }
    if (!res.ok) {
      const message = ((await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null)?.errors?.[0]?.message;
      return setMessageConnexion(message ?? 'Connexion refusée, veuillez réessayer.');
    }
    setMessageConnexion('');
    charger();
  };

  const chercher = (e: React.FormEvent) => {
    e.preventDefault();
    setChoisie(null);
    charger(recherche);
  };

  const ouvrir = (c: Commande) => {
    setChoisie(c);
    setConfirmation(false);
    setErreur('');
  };

  const encaisser = async () => {
    if (!choisie) return;
    setEnCours(true);
    setErreur('');
    try {
      const action = choisie.mode === 'code_marchand' ? 'valider-code-marchand' : 'encaisser';
      const res = await fetch(`/api/boutique/caisse/commandes/${encodeURIComponent(choisie.numero)}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montantXAF: choisie.totalXAF }),
      });
      if (res.status === 401) return setEtat('connexion');
      const d = await res.json();
      if (!res.ok) {
        setConfirmation(false);
        return setErreur(d.erreur ?? 'Encaissement refusé.');
      }
      setResultat(d as Encaissement);
      setNumeroWa((d as Encaissement).whatsapp.numero ? `+${(d as Encaissement).whatsapp.numero}` : choisie.telephone);
    } catch {
      setErreur('Réseau indisponible : l’encaissement n’est peut-être pas enregistré. Recherchez la commande avant de réessayer.');
    } finally {
      setEnCours(false);
    }
  };

  const suivant = () => {
    setResultat(null);
    setChoisie(null);
    setConfirmation(false);
    setRecherche('');
    charger();
    champRecherche.current?.focus();
  };

  const lienWa = resultat ? lienWhatsApp(numeroWhatsApp(numeroWa), resultat.message) : '';

  return (
    <>
      <header className="entete">
        <img src="/brand/logo.webp" alt="" />
        <p>Convention CRN 2026 — COM Boutique</p>
      </header>
      <main className="scan caisse">
        <h1>Caisse — espèces et code marchand</h1>

        {etat === 'connexion' && (
          <form className="carte-scan" onSubmit={connecter}>
            <h2>Connexion caissier</h2>
            <label>
              E-mail
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <label>
              Mot de passe
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="bouton" type="submit">
              Se connecter
            </button>
            <p className="message" role="alert">
              {messageConnexion}
            </p>
          </form>
        )}

        {etat === 'caisse' && !resultat && (
          <>
            <p className="caisse__journee">
              Aujourd’hui : <strong>{journee.nombre}</strong> encaissement{journee.nombre > 1 ? 's' : ''}, <strong>{formaterXAF(journee.totalXAF)}</strong>
            </p>

            {!choisie && (
              <div className="carte-scan">
                <form className="caisse__recherche" onSubmit={chercher}>
                  <label>
                    Numéro de commande, téléphone ou nom
                    <input ref={champRecherche} value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="ex. CRN-7KQ2M9P" autoComplete="off" spellCheck={false} />
                  </label>
                  <button className="bouton" type="submit">
                    Rechercher
                  </button>
                </form>
                <h2>{recherche.trim() ? 'Résultats' : 'Commandes à encaisser'}</h2>
                {commandes.length === 0 && <p>{recherche.trim() ? 'Aucune commande en espèces ou par code marchand ne correspond.' : 'Aucune commande en attente (espèces ou code marchand).'}</p>}
                <ul className="caisse__liste">
                  {commandes.map((c) => (
                    <li key={c.numero}>
                      <button type="button" className="caisse__commande" onClick={() => ouvrir(c)}>
                        <span>
                          <strong>{c.numero}</strong> · {c.client}
                          <br />
                          <span className="caisse__detail">
                            {c.codeMarchand ? `${c.codeMarchand.operateur} (code marchand) · ` : 'Espèces · '}
                            {c.telephone} · {etiquette(c)}
                          </span>
                        </span>
                        <strong>{formaterXAF(c.totalXAF)}</strong>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {choisie && (
              <div className="carte-scan">
                <h2>
                  Commande {choisie.numero} — {etiquette(choisie)}
                </h2>
                <p className="caisse__client">
                  {choisie.client} · {choisie.telephone}
                  {choisie.email ? ` · ${choisie.email}` : ''}
                </p>
                <ul className="caisse__lignes">
                  {choisie.lignes.map((l, i) => (
                    <li key={i}>
                      <span>
                        {l.quantite} × {l.libelle}
                      </span>
                      <span>{l.inclus ? 'inclus' : formaterXAF(l.montantXAF)}</span>
                    </li>
                  ))}
                </ul>
                <p className="montant">{formaterXAF(choisie.totalXAF)}</p>
                {choisie.codeMarchand && (
                  <div className="caisse__code-marchand">
                    <p>
                      <strong>{choisie.codeMarchand.operateur}</strong> — code commerçant {choisie.codeMarchand.codeCommercant} — référence attendue : {choisie.numero}
                    </p>
                    <p>
                      Identifiant de transaction déclaré : <strong>{choisie.codeMarchand.idTransaction ?? 'non envoyé'}</strong>
                    </p>
                    {choisie.codeMarchand.preuve ? (
                      <a className="bouton bouton--secondaire" href={`/api/boutique/caisse/commandes/${encodeURIComponent(choisie.numero)}/preuve`} target="_blank" rel="noopener noreferrer">
                        Voir la capture envoyée par le client
                      </a>
                    ) : (
                      <p className="message">Le client n’a pas encore envoyé sa preuve.</p>
                    )}
                    <p className="message">Vérifiez la réception de ce montant sur le compte marchand {choisie.codeMarchand.operateur} avant de valider : une capture peut être falsifiée.</p>
                  </div>
                )}
                <p className="caisse__detail">
                  Billets : {choisie.canalBillets === 'email' ? 'par e-mail' : choisie.canalBillets === 'whatsapp' ? 'par WhatsApp' : 'par e-mail et WhatsApp'}
                  {choisie.echeance && aEncaisser(choisie) ? ` · à payer avant le ${quand.format(new Date(choisie.echeance))}` : ''}
                </p>
                {erreur && (
                  <p className="message" role="alert">
                    {erreur}
                  </p>
                )}
                {aEncaisser(choisie) && !confirmation && (
                  <button className="bouton bouton--large" type="button" onClick={() => setConfirmation(true)}>
                    {choisie.codeMarchand ? `Valider le paiement de ${formaterXAF(choisie.totalXAF)}` : `Encaisser ${formaterXAF(choisie.totalXAF)}`}
                  </button>
                )}
                {aEncaisser(choisie) && confirmation && (
                  <div className="caisse__confirmation" role="alertdialog" aria-labelledby="confirmation-titre">
                    <p id="confirmation-titre">
                      {choisie.codeMarchand ? (
                        <>
                          Avez-vous vérifié la réception de <strong>{formaterXAF(choisie.totalXAF)}</strong> sur le compte marchand {choisie.codeMarchand.operateur}
                          {choisie.codeMarchand.idTransaction ? ` (transaction ${choisie.codeMarchand.idTransaction})` : ''}&nbsp;?
                        </>
                      ) : (
                        <>
                          Avez-vous reçu <strong>{formaterXAF(choisie.totalXAF)}</strong> en espèces de {choisie.client}&nbsp;?
                        </>
                      )}
                    </p>
                    <button className="bouton bouton--large" type="button" onClick={encaisser} disabled={enCours}>
                      {enCours ? 'Enregistrement…' : choisie.codeMarchand ? 'Oui, paiement vérifié : valider' : 'Oui, montant reçu : valider'}
                    </button>
                    <button className="bouton bouton--secondaire" type="button" onClick={() => setConfirmation(false)} disabled={enCours}>
                      Annuler
                    </button>
                  </div>
                )}
                {choisie.statut === 'en_attente' && choisie.expiree && <p className="message">Le délai de paiement est dépassé : refaites la commande avec le client sur la boutique, puis encaissez la nouvelle.</p>}
                <button className="bouton bouton--secondaire" type="button" onClick={() => setChoisie(null)} disabled={enCours}>
                  Retour à la liste
                </button>
              </div>
            )}
          </>
        )}

        {resultat && (
          <div className="carte-scan caisse__succes" role="status">
            <h2>{resultat.commande.mode === 'code_marchand' ? 'Paiement validé' : 'Encaissement enregistré'}</h2>
            <p>
              <strong>{formaterXAF(resultat.commande.totalXAF)}</strong> reçus pour la commande <strong>{resultat.commande.numero}</strong> ({resultat.commande.client}).
            </p>
            {resultat.billets.length > 0 && (
              <ul className="caisse__lignes">
                {resultat.billets.map((b) => (
                  <li key={b.numero}>
                    <span>
                      {b.titulaire} — {b.produit}
                    </span>
                    <span>{b.numero}</span>
                  </li>
                ))}
              </ul>
            )}
            {resultat.commande.email && resultat.commande.canalBillets !== 'whatsapp' && <p>Billets envoyés par e-mail à {resultat.commande.email}.</p>}
            <label>
              Numéro WhatsApp du client
              <input value={numeroWa} onChange={(e) => setNumeroWa(e.target.value)} type="tel" />
            </label>
            {numeroWhatsApp(numeroWa) ? (
              <a className={`bouton bouton--large caisse__whatsapp${veutWhatsApp(resultat.commande) ? '' : ' bouton--secondaire'}`} href={lienWa} target="_blank" rel="noopener noreferrer">
                Envoyer les billets par WhatsApp
              </a>
            ) : (
              <p className="message">Numéro WhatsApp à corriger (avec l’indicatif, ex. +241 …).</p>
            )}
            <CopierMessage message={resultat.message} classeBouton="bouton bouton--secondaire" classeZone="copier-message__zone" />
            <button className="bouton bouton--secondaire" type="button" onClick={suivant}>
              Encaissement suivant
            </button>
          </div>
        )}

        {etat === 'chargement' && <p>Chargement…</p>}
      </main>
    </>
  );
}
