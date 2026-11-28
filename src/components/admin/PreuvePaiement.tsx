'use client';

/*
  Fiche Commande : preuve de paiement par code marchand envoyée par le client (28 novembre 2026),
  ouverte dans un nouvel onglet. Elle se vérifie sur le compte marchand, jamais sur la seule capture.
*/
import { useDocumentInfo } from '@payloadcms/ui';
import React from 'react';

export const PreuvePaiement: React.FC = () => {
  const { savedDocumentData } = useDocumentInfo();
  const numero = savedDocumentData?.numero as string | undefined;
  const preuve = (savedDocumentData?.codeMarchand as { preuve?: string | null } | undefined)?.preuve;
  if (!numero || !preuve) return null;
  return (
    <p className="field-type">
      <a className="btn btn--style-secondary btn--size-small" href={`/api/boutique/caisse/commandes/${encodeURIComponent(numero)}/preuve`} target="_blank" rel="noopener noreferrer">
        Voir la capture envoyée par le client
      </a>
    </p>
  );
};

export default PreuvePaiement;
