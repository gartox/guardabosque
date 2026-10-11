import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { extractJson } from '../src/ollama.js';

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

test('reintenta sin format cuando Ollama no soporta salida estructurada', async () => {
  const requests = [];
  const ollama = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body); requests.push(payload);
    if (payload.format) { response.writeHead(501); return response.end('Not Implemented'); }
    const content = '```json\n{"kind":"bird","commonName":"Tucán real","scientificName":"Ramphastos sulfuratus","confidence":"high"}\n```';
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: { content } }));
  });
  const ollamaUrl = await listen(ollama);
  const dataDir = await mkdtemp(join(tmpdir(), 'guardabosque-fallback-'));
  const app = createApp({ ollamaUrl, dataDir, model: 'modelo-sin-formato', ollamaTimeoutMs: 2000 });
  const baseUrl = await listen(app);

  const post = () => fetch(`${baseUrl}/api/identify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'aGVsbG8=' }) });
  const first = await post();
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.commonName, 'Tucán real');
  assert.equal(body.kind, 'bird');
  assert.equal(requests.length, 2);
  assert.ok(requests[0].format);
  assert.equal(requests[1].format, undefined);
  assert.match(requests[1].messages[1].content, /JSON schema/);

  // La segunda llamada ya no vuelve a intentar con format.
  assert.equal((await post()).status, 200);
  assert.equal(requests.length, 3);
  assert.equal(requests[2].format, undefined);

  app.closeAllConnections(); ollama.closeAllConnections();
  await new Promise(resolve => app.close(resolve)); await new Promise(resolve => ollama.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

test('extrae el JSON aunque venga envuelto en texto o markdown', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('Claro:\n```json\n{"a":{"b":2}}\n```'), { a: { b: 2 } });
  assert.throws(() => extractJson('sin objeto'));
});
