import { createServer } from 'node:http';

import appComponent from './ssr.js';

const server = createServer((req, res) => {
  res.write(appComponent());
  res.end();
});

server.listen(8000);
