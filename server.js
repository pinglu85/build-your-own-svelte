import { createServer } from 'node:http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import appComponent from './ssr.js';
import { buildAppJs, buildAppAndSsr } from './index.js';

buildAppAndSsr();

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:8000');

  if (url.pathname === '/app.js') {
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

          const rootContainer = document.getElementById('app');
          let app = App()
          app.create(rootContainer);

          const ws = new WebSocket('ws://localhost:8080');
          ws.addEventListener('message', () => {
            // We use the query parameter to make browser refetch 'app.js' instead of 
            // returning the cached version.
            import('./app.js?t=' + Date.now()).then((newModule) => {
              // This part where we destroy the old component and then create the 
              // new component on the same place is something we will have to implement
              // if we are trying to implement a plugin for a bundler for the hot module
              // reloading.
              const App = newModule.default;
              // Capture the state of App component so that when we destroy the old 
              // version and create a new one, we can restore the state.
              const restoredState = app.captureState();
              app.destroy(rootContainer);
              app = App({ restoredState });
              app.create(rootContainer, false);
            });
          });
        </script>
      </body>
    </html>
  `);
  res.end();
});

server.listen(8000);

const webSockets = [];
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', function connection(ws) {
  webSockets.push(ws);

  ws.on('error', console.error);

  ws.on('close', () => {
    webSockets.splice(webSockets.indexOf(ws), 1);
  });
});

fs.watchFile(
  path.join(fileURLToPath(import.meta.url), '../app.svelte'),
  { interval: 0 },
  () => {
    buildAppJs();

    for (const ws of webSockets) {
      ws.send('Something has changed');
    }
  }
);
