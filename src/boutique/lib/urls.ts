/**
 * Adresses publiques : la boutique fait partie du site officiel (/boutique), le back-office sert
 * l'API et les billets PDF (liens signés).
 */
const sansBarre = (u: string) => u.trim().replace(/\/$/, '');

/** Origine du site public (première entrée de SITE_URL). */
export const urlSite = () => sansBarre((process.env.SITE_URL || 'http://localhost:4321').split(',')[0]!);

/** Origine publique du back-office (API, billets). */
export const urlBackOffice = () => sansBarre(process.env.PUBLIC_SERVER_URL || 'http://localhost:3001');

/** Page de suivi d'une commande sur le site. */
export const urlSuivi = (numero: string, jeton: string) =>
  `${urlSite()}/boutique/suivi?commande=${encodeURIComponent(numero)}&t=${encodeURIComponent(jeton)}`;
