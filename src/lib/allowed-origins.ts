// Origines du site public autorisées à appeler l'API (CORS). SITE_URL peut lister plusieurs
// origines séparées par des virgules ; pour chaque domaine public, la variante avec/sans « www. »
// est ajoutée, le site pouvant être servi sur les deux.
export function allowedOrigins(): string[] {
  const configured = (process.env.SITE_URL || 'http://localhost:4321')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const origins = new Set<string>();
  for (const origin of configured) {
    origins.add(origin);
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') continue;
      const twin = url.hostname.startsWith('www.') ? url.hostname.slice(4) : `www.${url.hostname}`;
      origins.add(`${url.protocol}//${twin}${url.port ? `:${url.port}` : ''}`);
    } catch {
      // Valeur mal formée : gardée telle quelle, sans variante.
    }
  }
  return [...origins];
}
