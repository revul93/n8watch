'use strict';

const http    = require('http');
const path    = require('path');
const express = require('express');

const { loadConfig }     = require('./config');
const db                 = require('./database');
const { initWebSocket }  = require('./websocket');
const emailSvc           = require('./email');
const alertEngine        = require('./alert-engine');
const { initScheduler }  = require('./scheduler');

// ── Routes ───────────────────────────────────────────────────────────────────
const targetsRouter     = require('./routes/targets');
const pingResultsRouter = require('./routes/ping-results');
const metricsRouter     = require('./routes/metrics');
const alertsRouter      = require('./routes/alerts');
const dashboardRouter   = require('./routes/dashboard');
const exportRouter      = require('./routes/export');

async function main() {
  // 1. Load config
  const config = loadConfig();
  const { port, host } = config.server;

  // 2. Init database
  db.initDatabase();
  console.log('[App] Database initialized');

  // 3. Sync targets from config
  db.syncTargets(config.targets);
  console.log(`[App] Synced ${config.targets.length} target(s) from config`);

  // 4. Create Express app
  const app = express();
  app.use(express.json());

  // 5. Serve static files from client/dist
  const distPath = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(distPath));

  // 6. Mount all API routes
  app.use('/api/targets',      targetsRouter);
  app.use('/api/targets',      metricsRouter);
  app.use('/api/targets',      exportRouter);
  app.use('/api/ping-results', pingResultsRouter);
  // ping-results route for /api/targets/:id/ping-results uses mergeParams — mount under /api
  app.use('/api',              pingResultsRouter);
  app.use('/api/alerts',       alertsRouter);
  app.use('/api/dashboard',    dashboardRouter);

  // 7. Create HTTP server and init WebSocket
  const server = http.createServer(app);
  const wss    = initWebSocket(server);

  // 8. Init email service
  emailSvc.initEmail(config.alerts && config.alerts.smtp ? config.alerts.smtp : null);

  // 9. Init alert engine
  alertEngine.initAlertEngine(db, wss, emailSvc, config);

  // 10. Init scheduler (ping + cleanup jobs)
  initScheduler(config, db, wss, alertEngine);

  // 11. Handle 404 for unmatched /api routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
  });

  // 12. SPA fallback — serve index.html for all non-API routes
  app.get('*', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        // No frontend built yet — return a friendly message
        res.status(200).send(
          '<html><body><h1>n8netwatch</h1><p>Backend running. Build the frontend or connect via API.</p></body></html>'
        );
      }
    });
  });

  // 13. Start HTTP server
  server.listen(port, host, () => {
    console.log(`[App] n8netwatch listening on http://${host}:${port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => shutdown(server));
  process.on('SIGINT',  () => shutdown(server));
}

function shutdown(server) {
  console.log('[App] Shutting down...');
  server.close(() => {
    console.log('[App] HTTP server closed');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[App] Fatal startup error:', err.message);
  process.exit(1);
});
