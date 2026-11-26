import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDatabaseClient } from './db/database.js';
import { MqttIngestionWorker } from './mqtt/mqtt-worker.js';
import { AlertService } from './services/alert.service.js';
import { FirmwareService } from './services/firmware.service.js';
import { RelayService } from './services/relay.service.js';
import { TelemetryService } from './services/telemetry.service.js';

async function bootstrap() {
  const env = loadEnv();
  const db = await createDatabaseClient({ databaseUrl: env.databaseUrl });

  let mqttWorker: MqttIngestionWorker | undefined;
  if (env.mqttEnabled && env.mqttBrokerUrl) {
    mqttWorker = new MqttIngestionWorker(
      new TelemetryService(db),
      new AlertService(db),
      {
        brokerUrl: env.mqttBrokerUrl,
        username: env.mqttUsername,
        password: env.mqttPassword,
        clientId: env.mqttClientId,
        caCertPath: env.mqttCaCertPath,
        rejectUnauthorized: env.mqttRejectUnauthorized,
      },
      new FirmwareService(db, env.githubFirmwareRepo, env.githubToken),
      new RelayService(db),
    );
    try {
      await mqttWorker.start();
      console.log(`[MQTT] Connected to ${env.mqttBrokerUrl}`);
    } catch (err) {
      console.error('[MQTT] Initial broker connection failed; retrying in background:', err);
    }
  }

  const { app } = createApp({ db, env, mqttWorker });
  const server = app.listen(env.port, () => {
    console.log(`[SEM API] Listening on http://localhost:${env.port} (DB: ${db.kind})`);
  });

  const shutdown = async () => {
    server.close();
    if (mqttWorker) await mqttWorker.stop();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

bootstrap().catch((err) => {
  console.error('[Fatal Startup Error]', err);
  process.exit(1);
});
