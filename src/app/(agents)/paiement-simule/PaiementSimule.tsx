'use client';

/*
  Simulation de la page de paiement hébergée par l'agrégateur : le client y choisit librement son
  moyen — Mobile Money (opérateur de son pays) ou carte bancaire — puis valide ou annule. La décision
  part en webhook signé, traité exactement comme celui de l'agrégateur réel, et le client revient
  au suivi de sa commande sur le site. Aucun numéro de carte n'est demandé : c'est une simulation.
*/
import React, { useEffect, useState } from 'react';

type Commande = { numero: string; montantXAF: number; statut: string };

const montant = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F CFA`;

export function PaiementSimule({ reference, retour }: { reference: string; retour: string }) {
  const [commande, setCommande] = useState<Commande | null>(null);
  const [erreur, setErreur] = useState('');
  const [moyen, setMoyen] = useState<'mobile_money' | 'carte'>('mobile_money');
  const [pays, setPays] = useState('');
  const [operateur, setOperateur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    fetch(`/api/boutique/bac-a-sable/paiement?ref=${encodeURIComponent(reference)}`)
      .then(async (r) => (r.ok ? setCommande(await r.json()) : setErreur('Session de paiement inconnue ou expirée.')))
      .catch(() => setErreur('Service de paiement indisponible.'));
  }, [reference]);

  const decider = async (issue: 'valider' | 'refuser') => {
    setEnvoi(true);
    const detail = moyen === 'carte' ? 'Carte bancaire (simulation)' : [operateur.trim() || 'Mobile Money', pays.trim()].filter(Boolean).join(' — ');
    const res = await fetch('/api/boutique/bac-a-sable/paiement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: reference, issue, moyen, detail }),
    });
    if (!res.ok) {
      setEnvoi(false);
      return setErreur('Le paiement n’a pas pu être traité.');
    }
    // Retour au suivi de la commande sur le site (adresse fournie à l'ouverture de la session).
    if (/^https?:\/\//.test(retour)) location.href = retour;
  };

  return (
    <>
      <header className="entete">
        <img src="/brand/logo.webp" alt="" />
        <p>Paiement sécurisé — Convention CRN 2026</p>
      </header>
      <main className="scan">
        <p className="bandeau-simulation" role="note">
          Simulation locale de la page de l’agrégateur de paiement : aucun débit réel.
        </p>
        <h1>Paiement</h1>
        {erreur && <p className="message" role="alert">{erreur}</p>}
        {commande && (
          <div className="carte-scan">
            <p className="montant">
              Commande {commande.numero} — <strong>{montant(commande.montantXAF)}</strong>
            </p>
            {commande.statut !== 'en_attente' ? (
              <p className="message">Cette commande n’est plus en attente de paiement.</p>
            ) : (
              <>
                <fieldset className="moyens">
                  <legend>Moyen de paiement</legend>
                  <label className="moyen">
                    <input type="radio" name="moyen" checked={moyen === 'mobile_money'} onChange={() => setMoyen('mobile_money')} />
                    <span>
                      <strong>Mobile Money</strong>
                      <br />
                      Opérateurs de plusieurs pays, selon la couverture de l’agrégateur
                    </span>
                  </label>
                  <label className="moyen">
                    <input type="radio" name="moyen" checked={moyen === 'carte'} onChange={() => setMoyen('carte')} />
                    <span>
                      <strong>Carte bancaire</strong>
                      <br />
                      Depuis le Gabon ou l’étranger
                    </span>
                  </label>
                </fieldset>
                {moyen === 'mobile_money' && (
                  <div className="reglages">
                    <label>
                      Pays
                      <input value={pays} onChange={(e) => setPays(e.target.value)} placeholder="ex. Gabon, Cameroun, Côte d’Ivoire…" />
                    </label>
                    <label>
                      Opérateur
                      <input value={operateur} onChange={(e) => setOperateur(e.target.value)} placeholder="ex. Airtel Money, MTN MoMo, Orange Money…" />
                    </label>
                  </div>
                )}
                <button className="bouton" type="button" disabled={envoi} onClick={() => decider('valider')}>
                  Payer {montant(commande.montantXAF)}
                </button>
                <button className="bouton bouton--secondaire" type="button" disabled={envoi} onClick={() => decider('refuser')}>
                  Refuser ou annuler le paiement
                </button>
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}
