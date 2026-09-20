import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { env } from './config/env';
import { setupSocket } from './sockets/socket';
import { startOverdueJob } from './jobs/overdue';

const app = createApp();

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: env.CLIENT_URL,
    credentials: true
  }
});

const presence = new Set<string>();

app.set('io', io);
app.set('presence', presence);

setupSocket(io, presence);
startOverdueJob(io);

httpServer.listen(env.PORT, '0.0.0.0', () => {
  console.log(`API listening on ${env.PORT}`);
});