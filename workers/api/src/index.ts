import { createWorkerApp } from './app';
import { SupabaseStore } from './store';
import { WorkerEnv } from './types';

const app = createWorkerApp((env) => new SupabaseStore(env));

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv, _ctx: ExecutionContext) {
    const store = new SupabaseStore(env);
    const retentionDays = Math.max(7, Number(env.TELEMETRY_RETENTION_DAYS ?? 30));
    const result = await store.pruneOldTelemetry(retentionDays);
    console.log('[SEM Cron] Telemetry retention prune completed:', JSON.stringify(result));
  },
};
