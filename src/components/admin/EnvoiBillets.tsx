'use client';

/*
  Fiche Commande : billets d'une commande payée (liens de téléchargement, QR code) et envoi par
  WhatsApp d'un toucher, comme à la caisse (17 novembre 2026). Une commande en espèces passée à
  « Payée » ici reçoit ses billets par e-mail aussitôt ; WhatsApp ne part que sur ce toucher.
*/
import { useDocumentInfo } from '@payloadcms/ui';
import React, { useEffect, useState } from 'react';

import { lienWhatsApp, numeroWhatsApp } from '../../boutique/domaine/src/whatsapp.ts';

interface Billets {
  statut: string;
  canalBillets?: 'email' | 'whatsapp' | 'email_whatsapp';
  email?: string | null;
  billets: { numero: string; titulaire: string; produit: string; lien: string }[];
  message: string | null;
  whatsapp: { numero: string | null } | null;
}

const ENVOI = { email: 'par e-mail', whatsapp: 'par WhatsApp', email_whatsapp: 'par e-mail et WhatsApp' };

export const EnvoiBillets: React.FC = () => {
  const { savedDocumentData } = useDocumentInfo();
  const numero = savedDocumentData?.numero as string | undefined;
  const statut = savedDocumentData?.statut as string | undefined;
  const [donnees, setDonnees] = useState<Billets | null>(null);
  const [numeroWa, setNumeroWa] = useState('');

  useEffect(() => {
    if (!numero || statut !== 'payee') return;
    let actif = true;
    fetch(`/api/boutique/caisse/commandes/${encodeURIComponent(numero)}/billets`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Billets | null) => {
        if (!actif || !d) return;
        setDonnees(d);
        setNumeroWa(d.whatsapp?.numero ? `+${d.whatsapp.numero}` : '');
      })
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [numero, statut]);

  if (statut !== 'payee' || !donnees || !donnees.billets.length) return null;
  const numeroValide = numeroWhatsApp(numeroWa);

  return (
    <div className="field-type envoi-billets">
      <h3 className="envoi-billets__titre">Billets émis</h3>
      <p>
        Envoi choisi par le client : {ENVOI[donnees.canalBillets ?? 'email']}
        {donnees.email && donnees.canalBillets !== 'whatsapp' ? ` — envoyés par e-mail à ${donnees.email}.` : '.'}
      </p>
      <ul className="envoi-billets__liste">
        {donnees.billets.map((b) => (
          <li key={b.numero}>
            <strong>{b.titulaire}</strong> — {b.produit} :{' '}
            <a href={b.lien} target="_blank" rel="noopener noreferrer">
              billet {b.numero} (QR code)
            </a>
          </li>
        ))}
      </ul>
      <label className="envoi-billets__champ">
        Numéro WhatsApp du client
        <input type="tel" value={numeroWa} onChange={(e) => setNumeroWa(e.target.value)} placeholder="+241 …" />
      </label>
      {numeroValide && donnees.message ? (
        <a className="btn btn--style-primary btn--size-medium envoi-billets__whatsapp" href={lienWhatsApp(numeroValide, donnees.message)} target="_blank" rel="noopener noreferrer">
          Envoyer les billets par WhatsApp
        </a>
      ) : (
        <p>Numéro WhatsApp à corriger (avec l’indicatif, ex. +241 …).</p>
      )}
    </div>
  );
};

export default EnvoiBillets;
