'use client';

/*
  Contrôle d'accès des agents COM Boutique (Palier 1 : en ligne ; hors ligne au Palier 2).
  Connexion nominative (compte du back-office, rôle COM Boutique), choix de la plateforme et du
  poste, lecture du QR par la caméra (BarcodeDetector) ou saisie du code. Verdict en plein écran
  (vert accepté, rouge refusé), avec un son et une vibration propres à chaque verdict, et le nom du
  titulaire pour le contrôle d'identité. La lecture est en pause tant que l'agent n'a pas touché
  « Scanner le suivant » : un QR resté devant la caméra n'est jamais compté deux fois (retour du
  test du 6 novembre 2026 : sept refus « déjà utilisé » après une entrée acceptée).
*/
import React, { useCallback, useEffect, useRef, useState } from 'react';

type Plateforme = { code: string; nom: string; lieu: string | null; debut: string | null };
type Resultat = { resultat?: string; erreur?: string; message?: string; titulaire?: { prenom: string; nom: string; produit: string } };
type Detecteur = { detect: (s: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

const TITRES: Record<string, string> = {
  accepte: 'Entrée acceptée',
  refuse_deja_utilise: 'Refusé — déjà utilisé',
  refuse_plateforme: 'Refusé — non inclus',
  refuse_annule: 'Refusé — billet annulé',
  refuse_invalide: 'Refusé — billet invalide',
};

const quand = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville' });

/** « Concert VIP — Église Centrale, dim. 13 déc., 17:00 » : la séance, son site et son heure (Libreville). */
const libellePlateforme = (p: Plateforme) =>
  [p.nom, [p.lieu ?? 'lieu à annoncer', p.debut ? quand.format(new Date(p.debut)) : null].filter(Boolean).join(', ')].join(' — ');

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

/*
  Sons synthétisés dans le navigateur (aucun fichier ni service externe) : deux notes montantes
  pour une entrée acceptée, trois bourdonnements graves pour un refus. Le contexte audio n'est
  autorisé qu'après un geste de l'agent : il est préparé au toucher de « Activer la caméra ».
*/
let contexteAudio: AudioContext | null = null;

const preparerSon = () => {
  try {
    contexteAudio ??= new AudioContext();
    if (contexteAudio.state === 'suspended') void contexteAudio.resume();
  } catch {
    /* audio indisponible : la vibration et l'écran suffisent */
  }
};

const jouer = (notes: { frequence: number; debut: number; duree: number }[], forme: OscillatorType) => {
  const ctx = contexteAudio;
  if (!ctx) return;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const volume = ctx.createGain();
    const t = ctx.currentTime + n.debut;
    osc.type = forme;
    osc.frequency.value = n.frequence;
    volume.gain.setValueAtTime(0.0001, t);
    volume.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.0001, t + n.duree);
    osc.connect(volume).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + n.duree + 0.02);
  }
};

const signaler = (accepte: boolean, avecSon: boolean) => {
  if (avecSon) {
    if (accepte) jouer([{ frequence: 880, debut: 0, duree: 0.14 }, { frequence: 1320, debut: 0.16, duree: 0.28 }], 'sine');
    else jouer([0, 0.24, 0.48].map((debut) => ({ frequence: 196, debut, duree: 0.2 })), 'square');
  }
  navigator.vibrate?.(accepte ? 150 : [300, 120, 300, 120, 300]);
};

export default function PageScan() {
  const [etat, setEtat] = useState<'chargement' | 'connexion' | 'poste'>('chargement');
  const [plateformes, setPlateformes] = useState<Plateforme[]>([]);
  const [plateforme, setPlateforme] = useState('');
  const [poste, setPoste] = useState('');
  const [code, setCode] = useState('');
  const [messageConnexion, setMessageConnexion] = useState('');
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [camera, setCamera] = useState(false);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  const [son, setSon] = useState(true);
  const [acceptes, setAcceptes] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const champPoste = useRef<HTMLInputElement>(null);
  const boutonSuivant = useRef<HTMLButtonElement>(null);
  // Lecture en pause pendant la vérification et tant que le verdict est affiché.
  const enPause = useRef(false);
  // Dernier QR traité : ignoré par la caméra 15 s après « Scanner le suivant » (resté devant l'objectif).
  const ignore = useRef({ code: '', jusqua: 0 });
  const dernierCode = useRef('');
  const reglages = useRef({ plateforme: '', poste: '', son: true });
  reglages.current = { plateforme, poste, son };

  const chargerPlateformes = useCallback(async () => {
    const res = await fetch('/api/boutique/scan/plateformes', { credentials: 'include' });
    if (res.status === 401 || res.status === 403) return setEtat('connexion');
    const liste: Plateforme[] = await res.json();
    setPlateformes(liste);
    // Affectation du profil (séance et poste par défaut), si ce téléphone n'a rien mémorisé.
    const profil = await fetch('/api/users/me?depth=1', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { user?: { seanceScan?: { code?: string } | null; posteScan?: string | null } } | null) => m?.user)
      .catch(() => undefined);
    const memo = lire('crn-scan-plateforme') || profil?.seanceScan?.code || '';
    setPlateforme(liste.some((p) => p.code === memo) ? memo : (liste[0]?.code ?? ''));
    if (!lire('crn-scan-poste') && profil?.posteScan) setPoste(profil.posteScan);
    setEtat('poste');
  }, []);

  useEffect(() => {
    setPoste(lire('crn-scan-poste'));
    setSon(lire('crn-scan-son') !== 'coupe');
    chargerPlateformes();
  }, [chargerPlateformes]);

  // Le bouton « Scanner le suivant » prend le focus dès que le verdict s'affiche.
  useEffect(() => {
    if (resultat) boutonSuivant.current?.focus();
  }, [resultat]);

  const connecter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const champs = Object.fromEntries(new FormData(e.currentTarget));
    let res: Response;
    try {
      res = await fetch('/api/users/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(champs),
      });
    } catch {
      return setMessageConnexion('Connexion impossible : vérifiez le réseau du poste, puis réessayez.');
    }
    if (res.ok) {
      setMessageConnexion('');
      return chargerPlateformes();
    }
    // Message exact du back-office : identifiants incorrects, ou compte verrouillé (5 échecs).
    const message = ((await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null)?.errors?.[0]?.message;
    setMessageConnexion(
      !message
        ? 'Connexion refusée, veuillez réessayer.'
        : /verrouill/i.test(message)
          ? `${message} Réessayez dans 10 minutes, ou demandez à un administrateur de le déverrouiller (Utilisateurs → Forcer le déverrouillage).`
          : message,
    );
  };

  /** `manuel` : saisie de l'agent, vérifiée même si le même code vient d'être lu. */
  const verifier = useCallback(async (brut: string, manuel = false) => {
    const jeton = brut.trim();
    if (!jeton || enPause.current) return;
    if (!manuel && jeton === ignore.current.code && Date.now() < ignore.current.jusqua) return;
    const { plateforme: p, poste: nomPoste, son: avecSon } = reglages.current;
    enPause.current = true;
    dernierCode.current = jeton;
    if (!nomPoste.trim()) {
      setReglagesOuverts(true);
      signaler(false, avecSon);
      return setResultat({ erreur: 'Indiquez d’abord le nom du poste.' });
    }
    setEnCours(true);
    let r: Resultat;
    try {
      const res = await fetch('/api/boutique/scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton, plateforme: p, poste: nomPoste.trim() }),
      });
      r = res.status === 401 ? { erreur: 'Session expirée : reconnectez-vous.' } : await res.json().catch(() => ({ erreur: 'Réponse illisible du serveur.' }));
    } catch {
      r = { erreur: 'Vérification impossible : réseau indisponible. Réessayez.' };
    }
    setEnCours(false);
    setResultat(r);
    if (r.resultat === 'accepte') setAcceptes((n) => n + 1);
    signaler(r.resultat === 'accepte', avecSon);
  }, []);

  const suivant = () => {
    ignore.current = { code: dernierCode.current, jusqua: Date.now() + 15_000 };
    if (resultat?.erreur?.startsWith('Session expirée')) setEtat('connexion');
    setResultat(null);
    setCode('');
    enPause.current = false;
  };

  const garderEcranAllume = async () => {
    try {
      await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<unknown> } }).wakeLock?.request('screen');
    } catch {
      /* non pris en charge : l'écran suit le réglage du téléphone */
    }
  };

  const activerCamera = async () => {
    preparerSon();
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detecteur }).BarcodeDetector;
    if (!Ctor) {
      enPause.current = true;
      return setResultat({ erreur: 'Lecture du QR non prise en charge par ce navigateur : utilisez la saisie du code, ou Chrome sur Android.' });
    }
    const v = video.current!;
    try {
      v.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      await v.play();
    } catch {
      enPause.current = true;
      return setResultat({ erreur: 'Caméra inaccessible : autorisez-la pour ce site dans le navigateur, puis réessayez.' });
    }
    setCamera(true);
    void garderEcranAllume();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void garderEcranAllume();
    });
    const detecteur = new Ctor({ formats: ['qr_code'] });
    const boucle = async () => {
      if (!enPause.current) {
        try {
          const [qr] = await detecteur.detect(v);
          if (qr) await verifier(qr.rawValue);
        } catch {
          /* image non lisible : on continue */
        }
      }
      setTimeout(boucle, 250);
    };
    boucle();
  };

  const changerSon = () => {
    preparerSon();
    const actif = !son;
    setSon(actif);
    ecrire('crn-scan-son', actif ? 'actif' : 'coupe');
  };

  const seance = plateformes.find((p) => p.code === plateforme);
  const accepte = resultat?.resultat === 'accepte';

  return (
    <>
      <header className="entete">
        <img src="/brand/logo.webp" alt="" />
        <p>Convention CRN 2026 — COM Boutique</p>
      </header>
      <main className="scan">
        <h1 hidden={camera}>Contrôle d’accès</h1>

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
          {camera && (
            <div className="contexte">
              <div className="contexte__texte">
                <strong>{seance?.nom ?? 'Séance à choisir'}</strong>
                <span>
                  {poste.trim() || 'Poste à nommer'} · {acceptes} entrée{acceptes > 1 ? 's' : ''} acceptée{acceptes > 1 ? 's' : ''}
                </span>
              </div>
              <div className="contexte__actions">
                <button className="bouton bouton--petit bouton--secondaire" type="button" onClick={changerSon} aria-pressed={son}>
                  {son ? 'Son activé' : 'Son coupé'}
                </button>
                <button className="bouton bouton--petit bouton--secondaire" type="button" onClick={() => setReglagesOuverts((o) => !o)} aria-expanded={reglagesOuverts}>
                  {reglagesOuverts ? 'Fermer' : 'Modifier'}
                </button>
              </div>
            </div>
          )}
          <div className="carte-scan">
            <div className="reglages" hidden={camera && !reglagesOuverts}>
              <label>
                Séance et site
                <select
                  value={plateforme}
                  onChange={(e) => {
                    setPlateforme(e.target.value);
                    ecrire('crn-scan-plateforme', e.target.value);
                  }}
                >
                  {plateformes.map((p) => (
                    <option key={p.code} value={p.code}>
                      {libellePlateforme(p)}
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
              <div className="camera__cadre" hidden={!camera}>
                <video ref={video} playsInline muted />
                <span className="camera__viseur" aria-hidden="true" />
                {enCours && <span className="camera__etat">Vérification…</span>}
              </div>
              {!camera && (
                <button className="bouton bouton--large" type="button" onClick={activerCamera}>
                  Activer la caméra
                </button>
              )}
            </div>
            <details className="saisie" open={!camera}>
              <summary>Saisir un code à la main</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  preparerSon();
                  verifier(code, true);
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
            </details>
          </div>
        </div>
      </main>

      {resultat && (
        <div className="verdict" data-resultat={resultat.resultat ?? 'erreur'} role="alertdialog" aria-modal="true" aria-labelledby="verdict-titre" aria-describedby="verdict-detail">
          <div className="verdict__corps">
            <span className="verdict__icone" aria-hidden="true">
              {accepte ? '✓' : '✕'}
            </span>
            <p id="verdict-titre" className="verdict__titre">
              {(resultat.resultat && TITRES[resultat.resultat]) || resultat.erreur || 'Erreur'}
            </p>
            <div id="verdict-detail">
              {resultat.titulaire && (
                <>
                  <p className="verdict__titulaire">
                    {resultat.titulaire.prenom} {resultat.titulaire.nom}
                  </p>
                  <p className="verdict__produit">{resultat.titulaire.produit}</p>
                </>
              )}
              {accepte && <p className="verdict__consigne">Contrôlez la pièce d’identité.</p>}
              {resultat.message && <p className="verdict__message">{resultat.message}</p>}
            </div>
          </div>
          <button ref={boutonSuivant} className="verdict__suivant" type="button" onClick={suivant}>
            Scanner le suivant
          </button>
        </div>
      )}
    </>
  );
}
