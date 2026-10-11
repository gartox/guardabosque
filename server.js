import { networkInterfaces } from 'node:os';
import { createApp } from './src/app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT debe ser un puerto válido.');
const app = createApp({
  model: process.env.GUARDABOSQUE_MODEL ?? 'gemma4:e4b',
  ollamaUrl: process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434',
  dataDir: process.env.DATA_DIR ?? './data'
});
app.on('error', error => { console.error('No se pudo iniciar Guardabosque:', error.message); process.exitCode = 1; });
app.listen(port, host, () => {
  const actualPort = app.address().port;
  console.log(`Guardabosque: http://localhost:${actualPort}`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (!address.internal && address.family === 'IPv4') console.log(`Red local: http://${address.address}:${actualPort}`);
    }
  }
});
