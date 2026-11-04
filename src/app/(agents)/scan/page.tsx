'use client';

/*
  Contrôle d'accès des agents COM Boutique (Palier 1 : en ligne ; hors ligne au Palier 2).
  Connexion nominative (compte du back-office, rôle COM Boutique), choix de la plateforme et du
  poste, lecture du QR par la caméra (BarcodeDetector) ou saisie du code. Résultat affiché en grand
  avec le nom du titulaire pour le contrôle d'identité ; second passage refusé avec l'heure et le
  poste du premier.
*/
import React, { useCallback, useEffect, useRef, useState } from 'react';

type Plateforme = { code: string; nom: string };
type Resultat = { resultat?: string; erreur?: string; message?: string; titulaire?: { prenom: string; nom: string; produit: string } };
type Detecteur = { detect: (s: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

const TITRES: Record<string, string> = {
  accepte: 'Entrée acceptée',
  refuse_deja_utilise: 'Refusé — déjà utilisé',
  refuse_plateforme: 'Refusé — non inclus',
  refuse_annule: 'Refusé — billet annulé',
  refuse_invalide: 'Refusé — billet invalide',
};

const lire = (cle: string) => {
  try {
    return localStorage.getItem(cle) ?? '';
  } catch {
    return '';
  }
};
const ecrire = (cle: string, valeur: string) => {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    /* stockage indisponible */
  }
};

export default function PageScan() {
  const [etat, setEtat] = useState<'chargement' | 'connexion' | 'poste'>('chargement');
  const [plateformes, setPlateformes] = useState<Plateforme[]>([]);
  const [plateforme, setPlateforme] = useState('');
  const [poste, setPoste] = useState('');
  const [code, setCode] = useState('');
  const [messageConnexion, setMessageConnexion] = useState('');
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const champPoste = useRef<HTMLInputElement>(null);
  const dernier = useRef({ code: '', instant: 0 });
  const reglages = useRef({ plateforme: '', poste: '' });
  reglages.current = { plateforme, poste };

  const chargerPlateformes = useCallback(async () => {
    const res = await fetch('/api/boutique/scan/plateformes', { credentials: 'include' });
    if (res.status === 401 || res.status === 403) return setEtat('connexion');
    const liste: Plateforme[] = await res.json();
    setPlateformes(liste);
    const memo = lire('crn-scan-plateforme');
    setPlateforme(liste.some((p) => p.code === memo) ? memo : (liste[0]?.code ?? ''));
    setEtat('poste');
  }, []);

  useEffect(() => {
    setPoste(lire('crn-scan-poste'));
    chargerPlateformes();
  }, [chargerPlateformes]);

  const connecter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const champs = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch('/api/users/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(champs),
    });
    setMessageConnexion(res.ok ? '' : 'Identifiants incorrects ou compte verrouillé.');
    if (res.ok) chargerPlateformes();
  };

  const verifier = useCallback(async (brut: string) => {
    const jeton = brut.trim();
    if (!jeton) return;
    // Évite de compter deux fois le même QR resté devant la caméra.
    if (jeton === dernier.current.code && Date.now() - dernier.current.instant < 4000) return;
    dernier.current = { code: jeton, instant: Date.now() };
    const { plateforme: p, poste: nomPoste } = reglages.current;
    if (!nomPoste.trim()) {
      champPoste.current?.focus();
      return setResultat({ erreur: 'Indiquez d’abord le nom du poste.' });
    }
    const res = await fetch('/api/boutique/scan', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton, plateforme: p, poste: nomPoste.trim() }),
    });
    const r: Resultat = await res.json().catch(() => ({ erreur: 'Réponse illisible du serveur.' }));
    setResultat(r);
    navigator.vibrate?.(r.resultat === 'accepte' ? 80 : [200, 100, 200]);
  }, []);

  const activerCamera = async () => {
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detecteur }).BarcodeDetector;
    if (!Ctor) return setResultat({ erreur: 'Lecture du QR non prise en charge par ce navigateur : utilisez la saisie du code, ou Chrome sur Android.' });
    const v = video.current!;
    v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    await v.play();
    setCamera(true);
    const detecteur = new Ctor({ formats: ['qr_code'] });
    const boucle = async () => {
      try {
        const [qr] = await detecteur.detect(v);
        if (qr) await verifier(qr.rawValue);
      } catch {
        /* image non lisible : on continue */
      }
      setTimeout(boucle, 300);
    };
    boucle();
  };

  return (
    <>
      <header className="entete">
        <img src="/brand/logo.webp" alt="" />
        <p>Convention CRN 2026 — COM Boutique</p>
      </header>
      <main className="scan">
        <h1>Contrôle d’accès</h1>

        {etat === 'connexion' && (
          <form className="carte-scan" onSubmit={connecter}>
            <h2>Connexion agent</h2>
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

        <div hidden={etat !== 'poste'}>
          <div className="carte-scan">
            <div className="reglages">
              <label>
                Plateforme
                <select
                  value={plateforme}
                  onChange={(e) => {
                    setPlateforme(e.target.value);
                    ecrire('crn-scan-plateforme', e.target.value);
                  }}
                >
                  {plateformes.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.nom}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Poste
                <input
                  ref={champPoste}
                  value={poste}
                  placeholder="ex. Église Centrale — porte 1"
                  onChange={(e) => {
                    setPoste(e.target.value);
                    ecrire('crn-scan-poste', e.target.value);
                  }}
                />
              </label>
            </div>
            <div className="camera">
              <video ref={video} playsInline muted hidden={!camera} />
              {!camera && (
                <button className="bouton" type="button" onClick={activerCamera}>
                  Activer la caméra
                </button>
              )}
            </div>
            <form
              className="saisie"
              onSubmit={(e) => {
                e.preventDefault();
                dernier.current.code = '';
                verifier(code);
              }}
            >
              <label>
                Code du billet
                <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Coller ou saisir le code du QR" />
              </label>
              <button className="bouton bouton--secondaire" type="submit">
                Vérifier
              </button>
            </form>
          </div>
          {resultat && (
            <div className="resultat" data-resultat={resultat.resultat ?? 'erreur'} role="status" aria-live="assertive">
              <p className="resultat__titre">{(resultat.resultat && TITRES[resultat.resultat]) || resultat.erreur || 'Erreur'}</p>
              {resultat.titulaire && (
                <p className="resultat__titulaire">
                  {resultat.titulaire.prenom} {resultat.titulaire.nom} — {resultat.titulaire.produit}
                </p>
              )}
              {resultat.message && <p>{resultat.message}</p>}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
