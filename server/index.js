"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const express = require("express");
const rateLimit = require("express-rate-limit");

const { loadConfig, watchConfig } = require("./config");
const db = require("./database");
const { initWebSocket, broadcast } = require("./websocket");
const emailSvc = require("./email");
const alertEngine = require("./alert-engine");
const { initScheduler, stopAll: stopScheduler } = require("./scheduler");

// ── Routes ───────────────────────────────────────────────────────────────────
const targetsRouter = require("./routes/targets");
const expiredTargetsRouter = require("./routes/expired-targets");
const pingResultsRouter = require("./routes/ping-results");
const metricsRouter = require("./routes/metrics");
const alertsRouter = require("./routes/alerts");
const dashboardRouter = require("./routes/dashboard");
const exportRouter = require("./routes/export");
const interfacesRouter = require("./routes/interfaces");
const versionRouter = require("./routes/version");

// Maximum time (ms) to wait for in-flight requests during graceful shutdown
const SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * Resolve the SMTP config to pass to the email service, respecting the
 * email_notifications toggle in config.alerts.
 */
function resolveEmailConfig(config) {
  if (!config.alerts) return null;
  if (config.alerts.email_notifications === false) return null;
  return config.alerts.smtp || null;
}

/**
 * Build a map of interface name -> interface entry from config.interfaces.
 */
function buildInterfaceMap(config) {
  if (!Array.isArray(config.interfaces)) return {};
  return Object.fromEntries(
    config.interfaces
      .filter((i) => i && typeof i.name === "string")
      .map((i) => [i.name, i]),
  );
}

/**
 * Enrich each target with interface_alias derived from config.interfaces
 * when the target specifies an interface name that matches a known entry.
 * If the interface name is not found in the map, the target is returned
 * unchanged (any existing interface_alias is preserved).
 */
function enrichTargets(targets, config) {
  const ifaceMap = buildInterfaceMap(config);
  return targets.map((t) => {
    if (t.interface && ifaceMap[t.interface]) {
      return { ...t, interface_alias: ifaceMap[t.interface].alias || null };
    }
    // interface not in map (or no interface set): return target as-is
    return t;
  });
}

async function main() {
  // 1. Load config
  const config = loadConfig();
  const { port, host } = config.server;

  // 2. Init database
  db.initDatabase();
  console.log("[App] Database initialized");

  // 3. Sync targets from config
  db.syncTargets(enrichTargets(config.targets, config));
  console.log(`[App] Synced ${config.targets.length} target(s) from config`);

  // 4. Create Express app
  const app = express();
  app.use(express.json());

  // Global rate limiter — 300 requests per minute per IP
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });
  app.use(globalLimiter);

  // 5. Serve static files from client/dist
  const distPath = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(distPath));

  // 6. Mount all API routes
  app.use("/api/targets", targetsRouter);
  app.use("/api/targets", expiredTargetsRouter);
  app.use("/api/targets", metricsRouter);
  app.use("/api/targets", exportRouter);
  app.use("/api/ping-results", pingResultsRouter);
  // ping-results route for /api/targets/:id/ping-results uses mergeParams — mount under /api
  app.use("/api", pingResultsRouter);
  app.use("/api/alerts", alertsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/interfaces", interfacesRouter);
  app.use("/api/version", versionRouter);

  // 7. Create HTTP/HTTPS server and init WebSocket
  let server;
  const ssl = config.server.ssl;
  if (ssl && ssl.enabled) {
    const sslOptions = {
      cert: fs.readFileSync(ssl.cert),
      key: fs.readFileSync(ssl.key),
    };
    if (ssl.ca) {
      sslOptions.ca = fs.readFileSync(ssl.ca);
    }
    server = https.createServer(sslOptions, app);
  } else {
    server = http.createServer(app);
  }
  const wss = initWebSocket(server);

  // 8. Init email service
  emailSvc.initEmail(resolveEmailConfig(config));

  // Send system start notification
  emailSvc.sendSystemStartEmail().catch(() => {});

  // 9. Init alert engine
  alertEngine.initAlertEngine(db, wss, emailSvc, config);

  // 10. Init scheduler (ping + cleanup jobs)
  initScheduler(config, db, wss, alertEngine, emailSvc);

  // 11. Watch config.yaml for live reload
  watchConfig((newConfig) => {
    // Re-sync targets (adds new, removes deleted)
    db.syncTargets(enrichTargets(newConfig.targets, newConfig));
    console.log(
      `[App] Live reload: synced ${newConfig.targets.length} target(s)`,
    );

    // Restart scheduler with potentially updated interval
    stopScheduler();
    initScheduler(newConfig, db, wss, alertEngine, emailSvc);

    // Reinitialize email service and alert engine with updated rules
    emailSvc.initEmail(resolveEmailConfig(newConfig));
    alertEngine.initAlertEngine(db, wss, emailSvc, newConfig);

    // Notify connected clients so they can refresh
    broadcast("config_reloaded", { targets_count: newConfig.targets.length });
  });

  // 12. Handle 404 for unmatched /api routes
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
  });

  // 13. SPA fallback — serve index.html for all non-API routes
  app.get("*", (req, res) => {
    const indexPath = path.join(distPath, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) {
        // No frontend built yet — return a friendly message
        res
          .status(200)
          .send(
            "<html><body><h1>n8watch</h1><p>Backend running. Build the frontend or connect via API.</p></body></html>",
          );
      }
    });
  });

  // 14. Start HTTP/HTTPS server
  const protocol = ssl && ssl.enabled ? "https" : "http";
  server.listen(port, host, () => {
    console.log(`[App] n8watch listening on ${protocol}://${host}:${port}`);
  });

  // Graceful shutdown
  const handleShutdown = () => shutdown(server);
  process.on("SIGTERM", handleShutdown);
  process.on("SIGINT", handleShutdown);
}

function shutdown(server) {
  console.log("[App] Shutting down...");

  // Stop scheduler so no new work is started during shutdown
  stopScheduler();

  // Send system shutdown notification (best-effort, fire-and-forget)
  emailSvc.sendSystemShutdownEmail().catch(() => {});

  // Force exit if graceful shutdown stalls beyond the timeout
  const timer = setTimeout(() => {
    console.log("[App] Forced exit after shutdown timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  server.close(() => {
    clearTimeout(timer);
    console.log("[App] HTTP server closed");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[App] Fatal startup error:", err.message);
  process.exit(1);
});
