'use client';

/*
  Préventes (Commanditaire, 26 novembre 2026) : pass et tickets payés avant l'ouverture de la
  boutique. L'administrateur ou la COM Boutique (compte nominatif) enregistre chaque acheteur, un
  par un ou en collant la liste depuis un tableur : la commande est créée au prix réellement payé
  (l'un des tarifs du produit), sans nouvel encaissement ; les billets sont aussitôt émis et
  envoyés par e-mail, et par WhatsApp d'un toucher.
*/
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { formaterXAF } from '../../../boutique/domaine/src/montants.ts';
import { lienWhatsApp, numeroWhatsApp } from '../../../boutique/domaine/src/whatsapp.ts';
import { CopierMessage } from '../../../components/CopierMessage';

type Produit = { id: number; nom: string; tarifs: { prixXAF: number; libelle: string }[]; kit: { article: string; choix: string[] }[] };
type Canal = 'email' | 'whatsapp' | 'email_whatsapp';
type Saisie = { prenom: string; nom: string; telephone: string; email: string; canalBillets: Canal; choixKit: string; reference: string };
type Resultat = {
  commande: { numero: string; client: string; email: string | null; canalBillets: Canal; totalXAF: number; telephone: string };
  billets: { numero: string; titulaire: string; produit: string }[];
  message: string;
  whatsapp: { numero: string | null };
};
type LigneImport = { saisie: Saisie; probleme: string | null; etat: 'attente' | 'en_cours' | 'ok' | 'erreur' | 'doublon'; detail?: string; resultat?: Resultat };

const SEPARATEUR = ' — ';
const vide: Saisie = { prenom: '', nom: '', telephone: '', email: '', canalBillets: 'email', choixKit: '', reference: '' };
const canalPar = (email: string): Canal => (email.trim() ? 'email' : 'whatsapp');
const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Choix du kit découpé en critères (ex. « Gamme 1 — Noir — M » → gamme, couleur, taille). */
function criteres(choix: string[]): string[][] {
  const parties = choix.map((c) => c.split(SEPARATEUR));
  const n = Math.max(...parties.map((p) => p.length));
  return Array.from({ length: n }, (_, i) => [...new Set(parties.map((p) => p[i] ?? ''))].filter(Boolean));
}

/** Retrouve le choix du kit à partir des colonnes saisies (casse et accents ignorés). */
function choixDepuis(choix: string[], valeurs: string[]): string | null {
  const cible = valeurs.map(sansAccents).join('|');
  return choix.find((c) => c.split(SEPARATEUR).map(sansAccents).join('|') === cible) ?? null;
}

export function Preventes() {
  const [etat, setEtat] = useState<'chargement' | 'connexion' | 'pret'>('chargement');
  const [messageConnexion, setMessageConnexion] = useState('');
  const [produits, setProduits] = useState<Produit[]>([]);
  const [produitId, setProduitId] = useState<number | null>(null);
  const [prixXAF, setPrixXAF] = useState<number | null>(null);
  const [saisie, setSaisie] = useState<Saisie>(vide);
  const [criteresKit, setCriteresKit] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState(false);
  const [doublon, setDoublon] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [numeroWa, setNumeroWa] = useState('');
  const [texteImport, setTexteImport] = useState('');
  const [importEnCours, setImportEnCours] = useState(false);
  const [lignesImport, setLignesImport] = useState<LigneImport[] | null>(null);
  const [copiee, setCopiee] = useState<number | null>(null);

  const produit = produits.find((p) => p.id === produitId) ?? null;
  const kit = produit?.kit[0] ?? null;
  const colonnesKit = useMemo(() => (kit ? criteres(kit.choix) : []), [kit]);
  const nomsCriteres = colonnesKit.length === 3 ? ['Gamme', 'Couleur', 'Taille'] : colonnesKit.map((_, i) => `Choix ${i + 1}`);

  const charger = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch('/api/boutique/preventes/options', { credentials: 'include' });
    } catch {
      return setErreur('Réseau indisponible : vérifiez la connexion du poste, puis réessayez.');
    }
    if (res.status === 401 || res.status === 403) return setEtat('connexion');
    const d: { produits: Produit[] } = await res.json();
    setProduits(d.produits);
    const premier = d.produits[0];
    if (premier) {
      setProduitId(premier.id);
      setPrixXAF(premier.tarifs[0]?.prixXAF ?? null);
    }
    setEtat('pret');
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

  const choisirProduit = (id: number) => {
    const p = produits.find((x) => x.id === id);
    setProduitId(id);
    setPrixXAF(p?.tarifs[0]?.prixXAF ?? null);
    setCriteresKit([]);
    setLignesImport(null);
  };

  const champ = (cle: keyof Saisie) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const valeur = e.target.value;
    setSaisie((s) => ({ ...s, [cle]: valeur, ...(cle === 'email' && s.canalBillets !== 'email_whatsapp' ? { canalBillets: canalPar(valeur) } : {}) }));
    setConfirmation(false);
    setDoublon(false);
  };

  const choixKit = kit ? choixDepuis(kit.choix, criteresKit) : '';
  const manque = !saisie.prenom.trim() || !saisie.nom.trim() || !saisie.telephone.trim() || (kit !== null && !choixKit) || !prixXAF;

  const envoyer = async (s: Saisie, confirmerDoublon = false): Promise<{ ok: true; resultat: Resultat } | { ok: false; status: number; erreur: string }> => {
    const res = await fetch('/api/boutique/preventes', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produitId, prixXAF, ...s, confirmerDoublon }),
    });
    if (res.status === 401) {
      setEtat('connexion');
      return { ok: false, status: 401, erreur: 'Session expirée : reconnectez-vous.' };
    }
    const d = await res.json();
    return res.ok ? { ok: true, resultat: d as Resultat } : { ok: false, status: res.status, erreur: d.erreur ?? 'Prévente refusée.' };
  };

  const enregistrer = async (confirmerDoublon = false) => {
    setEnCours(true);
    setErreur('');
    try {
      const r = await envoyer({ ...saisie, choixKit: choixKit ?? '' }, confirmerDoublon);
      if (!r.ok) {
        setConfirmation(false);
        setDoublon(r.status === 409 && r.erreur.startsWith('Prévente déjà enregistrée'));
        return setErreur(r.erreur);
      }
      setResultat(r.resultat);
      setNumeroWa(r.resultat.whatsapp.numero ? `+${r.resultat.whatsapp.numero}` : saisie.telephone);
    } catch {
      setErreur('Réseau indisponible : la prévente n’est peut-être pas enregistrée. Vérifiez dans Commandes avant de réessayer.');
    } finally {
      setEnCours(false);
    }
  };

  const suivante = () => {
    setResultat(null);
    setSaisie(vide);
    setCriteresKit([]);
    setConfirmation(false);
    setDoublon(false);
    setErreur('');
  };

  // Import : une ligne par acheteur, colonnes séparées par tabulation (copier-coller d'un tableur) ou point-virgule.
  const analyser = () => {
    const lignes = texteImport
      .split(/\r?\n/)
      .map((l) => l.split(l.includes('\t') ? '\t' : ';').map((c) => c.trim()))
      .filter((c) => c.some(Boolean))
      .filter((c, i) => !(i === 0 && sansAccents(c[0] ?? '') === 'prenom'));
    setLignesImport(
      lignes.map((c) => {
        const [prenom = '', nom = '', telephone = '', email = ''] = c;
        const valeursKit = c.slice(4, 4 + colonnesKit.length);
        const reference = c[4 + colonnesKit.length] ?? '';
        const choix = kit ? choixDepuis(kit.choix, valeursKit) : '';
        const probleme = !prenom || !nom ? 'prénom et nom obligatoires' : !telephone ? 'téléphone manquant' : kit && !choix ? `${kit.article.toLowerCase()} introuvable (${valeursKit.join(' / ') || 'non indiqué'})` : null;
        return { saisie: { prenom, nom, telephone, email, canalBillets: canalPar(email), choixKit: choix ?? '', reference }, probleme, etat: 'attente' as const };
      }),
    );
  };

  const importer = async () => {
    if (!lignesImport) return;
    setImportEnCours(true);
    const maj = (i: number, l: Partial<LigneImport>) => setLignesImport((ls) => ls && ls.map((x, j) => (j === i ? { ...x, ...l } : x)));
    for (const [i, l] of lignesImport.entries()) {
      if (l.probleme || l.etat === 'ok' || l.etat === 'doublon') continue;
      maj(i, { etat: 'en_cours' });
      try {
        const r = await envoyer(l.saisie);
        if (r.ok) maj(i, { etat: 'ok', detail: r.resultat.commande.numero, resultat: r.resultat });
        else if (r.status === 401) {
          maj(i, { etat: 'erreur', detail: r.erreur });
          break;
        } else maj(i, { etat: r.status === 409 && r.erreur.startsWith('Prévente déjà enregistrée') ? 'doublon' : 'erreur', detail: r.erreur });
      } catch {
        maj(i, { etat: 'erreur', detail: 'Réseau indisponible : vérifiez dans Commandes avant de relancer.' });
      }
    }
    setImportEnCours(false);
  };

  const valides = lignesImport?.filter((l) => !l.probleme && l.etat !== 'ok' && l.etat !== 'doublon').length ?? 0;
  const lienWa = resultat ? lienWhatsApp(numeroWhatsApp(numeroWa), resultat.message) : '';
  const libelleEtat: Record<LigneImport['etat'], string> = { attente: 'À enregistrer', en_cours: 'Enregistrement…', ok: 'Enregistrée', erreur: 'Refusée', doublon: 'Déjà enregistrée' };

  return (
    <>
      <header className="entete">
        <img src="/brand/logo.webp" alt="" />
        <p>Convention CRN 2026 — COM Boutique</p>
      </header>
      <main className="scan caisse">
        <h1>Préventes — pass payés avant l’ouverture</h1>

        {etat === 'connexion' && (
          <form className="carte-scan" onSubmit={connecter}>
            <h2>Connexion</h2>
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

        {etat === 'pret' && !resultat && (
          <>
            <p className="caisse__journee">
              Aucun paiement n’est demandé : la commande est créée au prix payé lors de la prévente, puis les billets sont émis et envoyés. Chaque enregistrement est inscrit à votre nom.
            </p>

            <div className="carte-scan">
              <h2>Produit et prix payé</h2>
              <label>
                Produit
                <select value={produitId ?? ''} onChange={(e) => choisirProduit(Number(e.target.value))}>
                  {produits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prix payé lors de la prévente
                <select value={prixXAF ?? ''} onChange={(e) => setPrixXAF(Number(e.target.value))}>
                  {produit?.tarifs.map((t) => (
                    <option key={t.prixXAF} value={t.prixXAF}>
                      {t.libelle}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <form
              className="carte-scan"
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmation(true);
              }}
            >
              <h2>Enregistrer une prévente</h2>
              <label>
                Prénom
                <input value={saisie.prenom} onChange={champ('prenom')} autoComplete="off" required />
              </label>
              <label>
                Nom
                <input value={saisie.nom} onChange={champ('nom')} autoComplete="off" required />
              </label>
              <label>
                Téléphone
                <input value={saisie.telephone} onChange={champ('telephone')} type="tel" placeholder="+241 …" autoComplete="off" required />
              </label>
              <label>
                E-mail (facultatif)
                <input value={saisie.email} onChange={champ('email')} type="email" autoComplete="off" />
              </label>
              <label>
                Envoi des billets
                <select value={saisie.canalBillets} onChange={champ('canalBillets')}>
                  <option value="email" disabled={!saisie.email.trim()}>
                    Par e-mail
                  </option>
                  <option value="whatsapp">Par WhatsApp</option>
                  <option value="email_whatsapp" disabled={!saisie.email.trim()}>
                    Par e-mail et WhatsApp
                  </option>
                </select>
              </label>
              {kit &&
                colonnesKit.map((valeurs, i) => (
                  <label key={i}>
                    {kit.article} — {nomsCriteres[i]}
                    <select
                      value={criteresKit[i] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCriteresKit((c) => Object.assign([...c], { [i]: v }));
                        setConfirmation(false);
                      }}
                      required
                    >
                      <option value="">Choisir…</option>
                      {valeurs.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              {kit && criteresKit.filter(Boolean).length === colonnesKit.length && !choixKit && <p className="message">Cette combinaison n’existe pas : changez l’un des choix.</p>}
              <label>
                Référence du paiement (facultatif : reçu, liste de prévente)
                <input value={saisie.reference} onChange={champ('reference')} autoComplete="off" />
              </label>
              {erreur && (
                <p className="message" role="alert">
                  {erreur}
                </p>
              )}
              {doublon && (
                <button className="bouton bouton--secondaire" type="button" onClick={() => enregistrer(true)} disabled={enCours}>
                  C’est une autre personne : enregistrer quand même
                </button>
              )}
              {!confirmation && (
                <button className="bouton bouton--large" type="submit" disabled={manque}>
                  Vérifier la prévente
                </button>
              )}
              {confirmation && produit && prixXAF && (
                <div className="caisse__confirmation" role="alertdialog" aria-labelledby="confirmation-titre">
                  <p id="confirmation-titre">
                    Enregistrer <strong>{produit.nom}</strong> pour <strong>{`${saisie.prenom} ${saisie.nom}`.trim()}</strong>, payé <strong>{formaterXAF(prixXAF)}</strong> lors de la prévente
                    {choixKit ? `, ${kit?.article.toLowerCase()} ${choixKit}` : ''}&nbsp;? Les billets seront émis et envoyés.
                  </p>
                  <button className="bouton bouton--large" type="button" onClick={() => enregistrer()} disabled={enCours}>
                    {enCours ? 'Enregistrement…' : 'Oui, enregistrer'}
                  </button>
                  <button className="bouton bouton--secondaire" type="button" onClick={() => setConfirmation(false)} disabled={enCours}>
                    Modifier
                  </button>
                </div>
              )}
            </form>

            <div className="carte-scan">
              <h2>Importer une liste</h2>
              <p className="caisse__detail">
                Collez les lignes d’un tableur (une ligne par acheteur), dans cet ordre : Prénom, Nom, Téléphone, E-mail
                {colonnesKit.length ? `, ${nomsCriteres.join(', ')}` : ''}, Référence. Colonnes séparées par tabulation ou point-virgule ; ligne d’en-tête facultative. Le produit et le prix sont ceux choisis ci-dessus.
              </p>
              <label>
                Lignes à importer
                <textarea
                  className="preventes__import"
                  value={texteImport}
                  onChange={(e) => {
                    setTexteImport(e.target.value);
                    setLignesImport(null);
                  }}
                  rows={6}
                  spellCheck={false}
                />
              </label>
              <button className="bouton bouton--secondaire" type="button" onClick={analyser} disabled={!texteImport.trim() || importEnCours}>
                Vérifier la liste
              </button>
              {lignesImport && (
                <>
                  <ul className="caisse__lignes">
                    {lignesImport.map((l, i) => (
                      <li key={i}>
                        <span>
                          <strong>
                            {l.saisie.prenom} {l.saisie.nom}
                          </strong>{' '}
                          · {l.saisie.telephone}
                          {l.saisie.choixKit ? ` · ${l.saisie.choixKit}` : ''}
                          <br />
                          <span className="caisse__detail">{l.probleme ? `À corriger : ${l.probleme}` : l.detail ? `${libelleEtat[l.etat]} — ${l.detail}` : libelleEtat[l.etat]}</span>
                        </span>
                        {l.etat === 'ok' && l.resultat && (
                          <span className="preventes__actions">
                            <button
                              className="bouton bouton--petit bouton--secondaire"
                              type="button"
                              onClick={() => {
                                const message = l.resultat!.message;
                                navigator.clipboard?.writeText(message).then(
                                  () => setCopiee(i),
                                  () => window.prompt('Copiez le message :', message),
                                );
                              }}
                            >
                              {copiee === i ? 'Copié' : 'Copier'}
                            </button>
                            {l.saisie.canalBillets !== 'email' && numeroWhatsApp(l.saisie.telephone) && (
                              <a className="bouton bouton--petit" href={lienWhatsApp(numeroWhatsApp(l.saisie.telephone), l.resultat.message)} target="_blank" rel="noopener noreferrer">
                                WhatsApp
                              </a>
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="caisse__detail">
                    {lignesImport.filter((l) => l.etat === 'ok').length} enregistrée(s) · {lignesImport.filter((l) => l.probleme).length} à corriger · {valides} à enregistrer
                  </p>
                  {valides > 0 && produit && prixXAF && (
                    <button
                      className="bouton bouton--large"
                      type="button"
                      disabled={importEnCours}
                      onClick={() => {
                        if (window.confirm(`Enregistrer ${valides} prévente(s) de ${produit.nom} à ${formaterXAF(prixXAF)} ? Les billets seront émis et envoyés.`)) importer();
                      }}
                    >
                      {importEnCours ? 'Enregistrement…' : `Enregistrer ${valides} prévente(s)`}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {resultat && (
          <div className="carte-scan caisse__succes" role="status">
            <h2>Prévente enregistrée</h2>
            <p>
              Commande <strong>{resultat.commande.numero}</strong> ({resultat.commande.client}), <strong>{formaterXAF(resultat.commande.totalXAF)}</strong> payés lors de la prévente.
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
              Numéro WhatsApp de l’acheteur
              <input value={numeroWa} onChange={(e) => setNumeroWa(e.target.value)} type="tel" />
            </label>
            {numeroWhatsApp(numeroWa) ? (
              <a className={`bouton bouton--large caisse__whatsapp${resultat.commande.canalBillets !== 'email' ? '' : ' bouton--secondaire'}`} href={lienWa} target="_blank" rel="noopener noreferrer">
                Envoyer les billets par WhatsApp
              </a>
            ) : (
              <p className="message">Numéro WhatsApp à corriger (avec l’indicatif, ex. +241 …).</p>
            )}
            <CopierMessage message={resultat.message} classeBouton="bouton bouton--secondaire" classeZone="copier-message__zone" />
            <button className="bouton bouton--secondaire" type="button" onClick={suivante}>
              Prévente suivante
            </button>
          </div>
        )}

        {etat === 'chargement' && <p>Chargement…</p>}
      </main>
    </>
  );
}
