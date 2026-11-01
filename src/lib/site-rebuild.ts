/**
 * Republication du site public après une modification dans l'admin. Le site est statique et
 * reconstruit par Hostinger à chaque commit sur le dépôt qu'il suit (Hostinger n'offre pas d'URL
 * de déclenchement) : on crée donc un commit vide sur ce dépôt via l'API GitHub.
 *
 * Variables : SITE_REBUILD_GITHUB_TOKEN (jeton GitHub limité à ce dépôt, droit « Contents » en
 * écriture) et SITE_REBUILD_GITHUB_REPO (ex. Black-0574/CRN-Convention-2026-Site-Hostinger).
 * Sans jeton, rien n'est déclenché (journalisé).
 *
 * Regroupement : une rafale de modifications ne déclenche qu'une reconstruction, lancée
 * REBUILD_DELAY_MS après la dernière modification.
 */
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, GlobalAfterChangeHook, Payload } from 'payload';

const REBUILD_DELAY_MS = 20_000;

let timer: ReturnType<typeof setTimeout> | null = null;
const reasons = new Set<string>();

async function github(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.SITE_REBUILD_GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.SITE_REBUILD_GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path} : HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function triggerRebuild(payload: Payload, summary: string) {
  if (!process.env.SITE_REBUILD_GITHUB_TOKEN || !process.env.SITE_REBUILD_GITHUB_REPO) {
    payload.logger.info(`Site non republié (SITE_REBUILD_GITHUB_TOKEN/REPO absents) : ${summary}`);
    return;
  }
  const ref = await github('/git/ref/heads/main');
  const head = await github(`/git/commits/${ref.object.sha}`);
  const commit = await github('/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message: `Contenu mis à jour depuis le back-office (${summary})`,
      tree: head.tree.sha,
      parents: [ref.object.sha],
    }),
  });
  await github('/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
  payload.logger.info(`Republication du site demandée : ${summary}`);
}

export function scheduleSiteRebuild(payload: Payload, reason: string) {
  reasons.add(reason);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const summary = [...reasons].join(', ');
    reasons.clear();
    triggerRebuild(payload, summary).catch((err) => payload.logger.error(`Republication du site échouée : ${(err as Error).message}`));
  }, REBUILD_DELAY_MS);
}

export const rebuildAfterChange: CollectionAfterChangeHook = ({ req, collection }) => {
  scheduleSiteRebuild(req.payload, collection.labels.plural as string);
};

export const rebuildAfterDelete: CollectionAfterDeleteHook = ({ req, collection }) => {
  scheduleSiteRebuild(req.payload, collection.labels.plural as string);
};

export const rebuildAfterGlobalChange: GlobalAfterChangeHook = ({ req, global }) => {
  scheduleSiteRebuild(req.payload, String(global.label ?? global.slug));
};
