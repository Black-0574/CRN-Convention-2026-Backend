import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import next from 'next';

// Applique les migrations de schéma en attente avant de servir la première requête — nécessaire
// derrière ce serveur personnalisé (hébergement sans accès shell, ex. Hostinger/Docker) :
// contrairement au mode développement, le schéma n'est pas synchronisé automatiquement en
// production. adapter.migrate() (appelé par ce binaire) ne réapplique jamais une migration déjà
// enregistrée — sûr à chaque redémarrage. Lancé en sous-processus car payload.config.ts est en
// TypeScript : le binaire payload sait le charger, un simple `import` depuis ce fichier non plus.
execFileSync(process.execPath, ['node_modules/payload/bin.js', 'migrate'], { stdio: 'inherit' });

const port = process.env.PORT || 3001;
const app = next({ dev: process.env.NODE_ENV !== 'production' });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, () => {
    console.log(`> Prêt sur le port ${port}`);
  });
});
