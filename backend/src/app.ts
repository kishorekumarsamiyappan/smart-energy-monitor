import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { BackendEnv } from './config/env.js';
import { DatabaseClient } from './db/database.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { createRateLimiters } from './middleware/rate-limit.js';
import { MqttIngestionWorker } from './mqtt/mqtt-worker.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createAlertRouter } from './routes/alert.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createBillingRouter } from './routes/billing.routes.js';
import { createDeviceRouter } from './routes/device.routes.js';
import { createAdminFirmwareRouter, createFirmwareRouter } from './routes/firmware.routes.js';
import { createReportRouter } from './routes/report.routes.js';
import { createAdminTariffRouter, createTariffRouter } from './routes/tariff.routes.js';
import { AlertService } from './services/alert.service.js';
import { AuthService } from './services/auth.service.js';
import { BillingService } from './services/billing.service.js';
import { DeviceService } from './services/device.service.js';
import { FirmwareService } from './services/firmware.service.js';
import { RelayService } from './services/relay.service.js';
import { TelemetryService } from './services/telemetry.service.js';

export function createApp(options: {
  db: DatabaseClient;
  env: BackendEnv;
  mqttWorker?: MqttIngestionWorker;
}) {
  const { db, env, mqttWorker } = options;
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  const { apiLimiter, authLimiter } = createRateLimiters(env);
  app.use('/api', apiLimiter);

  const authService = new AuthService(db, env.jwtSecret);
  const deviceService = new DeviceService(db);
  const telemetryService = new TelemetryService(db);
  const billingService = new BillingService(db);
  const alertService = new AlertService(db);
  const firmwareService = new FirmwareService(db, env.githubFirmwareRepo, env.githubToken);
  const relayService = new RelayService(db);

  const { requireAuth, requireAdmin } = createAuthMiddleware(db, env.jwtSecret);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'smart-energy-monitor-api',
      database: db.kind,
      mqtt: mqttWorker ? mqttWorker.getStatus() : { connected: false, disabled: !env.mqttEnabled },
      timezone: 'Asia/Kolkata',
      timestampUtc: new Date().toISOString(),
    });
  });

  app.get('/api/docs/openapi.json', (_req, res) => {
    const docPath = path.resolve(import.meta.dirname, './docs/openapi.json');
    if (fs.existsSync(docPath)) {
      res.type('application/json').send(fs.readFileSync(docPath, 'utf8'));
    } else {
      res.status(404).json({ error: 'OpenAPI spec missing' });
    }
  });

  app.use('/api/auth', authLimiter, createAuthRouter(authService, requireAuth));
  app.use(
    '/api/devices',
    requireAuth,
    createDeviceRouter(
      deviceService,
      telemetryService,
      mqttWorker ? (id, cfg) => mqttWorker.publishDeviceConfig(id, cfg) : undefined,
      firmwareService,
      relayService,
      mqttWorker ? (id, cmd, params) => mqttWorker.publishDeviceCommand(id, cmd, params) : undefined,
    ),
  );
  app.use('/api/firmware', requireAuth, createFirmwareRouter(firmwareService));
  app.use('/api/admin/firmware', requireAuth, requireAdmin, createAdminFirmwareRouter(firmwareService));
  app.use('/api/billing', requireAuth, createBillingRouter(billingService, deviceService, telemetryService));
  app.use('/api/tariffs', requireAuth, createTariffRouter(billingService));
  app.use('/api/admin/tariffs', requireAuth, requireAdmin, createAdminTariffRouter(billingService));
  app.use('/api/alerts', requireAuth, createAlertRouter(alertService, deviceService));
  app.use(
    '/api/reports',
    requireAuth,
    createReportRouter(deviceService, telemetryService, billingService, alertService),
  );
  app.use('/api/admin', requireAuth, requireAdmin, createAdminRouter(db, deviceService, alertService));

  app.use(errorHandler);

  return {
    app,
    services: {
      authService,
      deviceService,
      telemetryService,
      billingService,
      alertService,
      firmwareService,
      relayService,
    },
  };
}
