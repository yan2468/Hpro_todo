import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { registerAuth } from './auth.js';
import { registerTasks } from './tasks.js';
import { registerHabits } from './habits.js';
import { registerReports } from './reports.js';
import { registerCosts } from './costs.js';
import { registerSettings } from './settings.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string };
    user: { id: string; email: string };
  }
}

const app = Fastify({ logger: true, ignoreTrailingSlash: true });

const rawCors = process.env.CORS_ORIGINS;
const corsOrigins = rawCors
  ? (JSON.parse(rawCors) as string[])
  : true;

await app.register(cors, { origin: corsOrigins });
await app.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret-change-me' });

app.get('/health', async () => ({ ok: true }));

await registerAuth(app);
await registerTasks(app);
await registerHabits(app);
await registerReports(app);
await registerCosts(app);
await registerSettings(app);

const port = Number(process.env.PORT) || 8787;
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Dave tasks server listening on :${port}`);
});
