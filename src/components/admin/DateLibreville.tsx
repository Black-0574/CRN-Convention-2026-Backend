'use client';

/*
  Cellule de liste pour les dates du back-office : toujours affichées à l'heure de Libreville
  (Africa/Libreville, UTC+1, sans heure d'été — règle permanente de la boutique), quel que soit le
  fuseau de l'ordinateur qui consulte. La cellule par défaut de Payload suit le fuseau du
  navigateur : un poste réglé sur Paris ou UTC décalait les passages au scan d'une heure.
*/
import React from 'react';

const format = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Africa/Libreville',
});

export const DateLibreville: React.FC<{ cellData?: unknown }> = ({ cellData }) => {
  if (typeof cellData !== 'string' && !(cellData instanceof Date)) return null;
  const date = new Date(cellData);
  if (Number.isNaN(date.getTime())) return null;
  return <span title="Heure de Libreville">{format.format(date)}</span>;
};

export default DateLibreville;
