'use client';

/*
  Message des billets à copier (Commanditaire, 26 novembre 2026) : quand le lien WhatsApp ne
  s'ouvre pas sur le poste, l'équipe copie le message (liens de téléchargement des billets
  compris) et le colle elle-même dans WhatsApp. Fiche Commande, caisse et préventes.
*/
import React, { useRef, useState } from 'react';

interface Props {
  message: string;
  /** Classes du bouton (styles de la page qui l'affiche). */
  classeBouton: string;
  classeZone?: string;
  libelle?: string;
}

export function CopierMessage({ message, classeBouton, classeZone, libelle = 'Message à envoyer au client (liens des billets compris)' }: Props) {
  const zone = useRef<HTMLTextAreaElement>(null);
  const [etat, setEtat] = useState<'' | 'copie' | 'manuel'>('');

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setEtat('copie');
    } catch {
      // Presse-papiers refusé (navigateur ancien, page non sécurisée) : copie par sélection.
      zone.current?.select();
      setEtat(document.execCommand?.('copy') ? 'copie' : 'manuel');
    }
  };

  return (
    <div className="copier-message">
      <label>
        {libelle}
        <textarea ref={zone} className={classeZone} value={message} readOnly rows={8} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <button className={classeBouton} type="button" onClick={copier}>
        {etat === 'copie' ? 'Message copié : collez-le dans WhatsApp' : 'Copier le message'}
      </button>
      {etat === 'manuel' && <p role="alert">Copie automatique impossible : le texte est sélectionné, utilisez « Copier » de votre appareil.</p>}
    </div>
  );
}
