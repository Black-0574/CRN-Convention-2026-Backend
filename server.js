import { createServer } from 'node:http';
import next from 'next';

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
