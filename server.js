import { createServer } from 'node:http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import appComponent from './ssr.js';

const server = createServer((req, res) => {
  if (req.url === '/app.js') {
    const appJsContent = fs.readFileSync(
      path.join(fileURLToPath(import.meta.url), '../app.js'),
      'utf-8'
    );

    res.setHeader('Content-Type', 'text/javascript');
    res.write(appJsContent);
    res.end();
    return;
  }

  res.write(`
    <html>
      <body>
        <div id="app">${appComponent()}</div>

        <script type="module">
          import App from './app.js';
          App().create(document.getElementById('app'));
        </script>
      </body>
    </html>
  `);
  res.end();
});

server.listen(8000);
