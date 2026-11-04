/**
 * Journal des actions du back-office (prompt maître, « Back-office ») : toute création,
 * modification ou suppression faite par un utilisateur dans le catalogue est tracée (qui, quoi,
 * quand, valeurs modifiées).
 */
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig } from 'payload';

function differences(avant: Record<string, unknown> | undefined, apres: Record<string, unknown>) {
  const ignorer = new Set(['updatedAt', 'createdAt']);
  const modifs: Record<string, { avant: unknown; apres: unknown }> = {};
  for (const cle of Object.keys(apres)) {
    if (ignorer.has(cle)) continue;
    if (JSON.stringify(avant?.[cle]) !== JSON.stringify(apres[cle])) modifs[cle] = { avant: avant?.[cle], apres: apres[cle] };
  }
  return modifs;
}

const apresModification: CollectionAfterChangeHook = async ({ req, doc, previousDoc, operation, collection }) => {
  if (!req.user) return doc; // écritures faites par le serveur lui-même (ventes) : non journalisées ici
  await req.payload.create({
    collection: 'journal-actions',
    data: {
      utilisateur: req.user.id,
      action: operation === 'create' ? 'création' : 'modification',
      collection: collection.slug,
      document: String(doc.id),
      details: operation === 'create' ? null : differences(previousDoc, doc),
    },
    req,
  });
  return doc;
};

const apresSuppression: CollectionAfterDeleteHook = async ({ req, doc, collection }) => {
  if (!req.user) return doc;
  await req.payload.create({
    collection: 'journal-actions',
    data: { utilisateur: req.user.id, action: 'suppression', collection: collection.slug, document: String(doc.id), details: doc },
    req,
  });
  return doc;
};

export const journaliser = (c: CollectionConfig): CollectionConfig => ({
  ...c,
  hooks: {
    ...c.hooks,
    afterChange: [...(c.hooks?.afterChange ?? []), apresModification],
    afterDelete: [...(c.hooks?.afterDelete ?? []), apresSuppression],
  },
});
