import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

let app;
let ollama;
let baseUrl;
let ollamaUrl;
let dataDir;
let modelContent;
let lastRequest;

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'guardabosque-'));
  modelContent = JSON.stringify({ kind: 'bird', commonName: 'Ave de prueba', scientificName: 'Avis prueba', confidence: 'medium', description: 'Observa sus colores.', lookFor: ['alas', 'pico'], safety: '', fieldQuest: 'Camina en silencio.' });
  ollama = createServer(async (request, response) => {
    if (request.url === '/api/tags') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"models":[]}'); return; }
    if (request.url !== '/api/chat') { response.writeHead(404); response.end(); return; }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    lastRequest = JSON.parse(Buffer.concat(chunks).toString());
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ message: { content: modelContent } }));
  });
  ollamaUrl = await listen(ollama);
  app = createApp({ ollamaUrl, dataDir, model: 'modelo-prueba', healthTimeoutMs: 500, ollamaTimeoutMs: 500 });
  baseUrl = await listen(app);
});

after(async () => {
  // fetch deja conexiones keep-alive abiertas; sin cerrarlas, close() nunca termina.
  app.closeAllConnections(); ollama.closeAllConnections();
  await new Promise(resolve => app.close(resolve)); await new Promise(resolve => ollama.close(resolve)); await rm(dataDir, { recursive: true, force: true }); });

test('identifica una imagen y envía el formato requerido al modelo', async () => {
  const result = await call('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'data:image/jpeg;base64,aGVsbG8=', note: 'hojas' }) });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, { kind: 'bird', commonName: 'Ave de prueba', scientificName: 'Avis prueba', confidence: 'medium', description: 'Observa sus colores.', lookFor: ['alas', 'pico'], safety: '', fieldQuest: 'Camina en silencio.' });
  assert.equal(lastRequest.model, 'modelo-prueba'); assert.equal(lastRequest.stream, false); assert.deepEqual(lastRequest.messages[1].images, ['aGVsbG8=']); assert.equal(lastRequest.format.type, 'object');
});

test('devuelve 502 ante JSON roto y sigue disponible', async () => {
  modelContent = '{ roto';
  const failed = await call('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'aGVsbG8=' }) });
  assert.equal(failed.response.status, 502); assert.match(failed.body.error, /JSON inválido/);
  modelContent = JSON.stringify({});
  const next = await call('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'aGVsbG8=' }) });
  assert.equal(next.response.status, 200); assert.equal(next.body.kind, 'unknown');
});

test('rechaza cuerpos inválidos y no llama al modelo', async () => {
  let calls = 0; const original = lastRequest;
  const beforeRequest = lastRequest;
  const invalid = await call('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(invalid.response.status, 400); assert.equal(lastRequest, beforeRequest);
  const missing = await call('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  assert.equal(missing.response.status, 400); assert.equal(lastRequest, original);
  assert.equal(calls, 0);
});

test('limita el tamaño del cuerpo antes de llamar al modelo', async () => {
  const previous = lastRequest;
  const huge = JSON.stringify({ image: 'A'.repeat(8 * 1024 * 1024) });
  const result = await call('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: huge });
  assert.equal(result.response.status, 413); assert.equal(lastRequest, previous);
});

test('normaliza y persiste el diario entre instancias', async () => {
  modelContent = JSON.stringify({});
  const saved = await call('/api/journal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result: { commonName: '<img src=x onerror=alert(1)>', lookFor: ['a', 'b', 'c', 'd', 'e'] }, thumbnail: 'data:image/jpeg;base64,aGVsbG8=', placeId: 'cerca' }) });
  assert.equal(saved.response.status, 201); assert.equal(saved.body.result.commonName, '<img src=x onerror=alert(1)>');
  const second = createApp({ dataDir, ollamaUrl }); const secondUrl = await listen(second);
  const listed = await fetch(`${secondUrl}/api/journal`); const entries = await listed.json();
  assert.equal(entries.length, 1); assert.equal(entries[0].result.kind, 'unknown');
  const removed = await fetch(`${secondUrl}/api/journal/${saved.body.id}`, { method: 'DELETE' }); assert.equal(removed.status, 200);
  assert.deepEqual(await (await fetch(`${secondUrl}/api/journal`)).json(), []);
  await new Promise(resolve => second.close(resolve));
  const file = await readFile(join(dataDir, 'journal.json'), 'utf8'); assert.deepEqual(JSON.parse(file), []);
});

test('aplica límites y errores de rutas', async () => {
  const bigThumbnail = `data:image/jpeg;base64,${'A'.repeat(200 * 1024)}`;
  const tooBig = await call('/api/journal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result: {}, thumbnail: bigThumbnail }) });
  assert.equal(tooBig.response.status, 413);
  assert.equal((await call('/api/does-not-exist')).response.status, 404);
  assert.equal((await call('/api/places', { method: 'POST' })).response.status, 405);
  assert.equal((await call('/..%2Fpackage.json')).response.status, 404);
});

test('reporta cuando Ollama está apagado', async () => {
  const unavailable = createApp({ ollamaUrl: 'http://127.0.0.1:1', dataDir, model: 'modelo-prueba' }); const unavailableUrl = await listen(unavailable);
  const response = await fetch(`${unavailableUrl}/api/identify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'aGVsbG8=' }) });
  const body = await response.json(); assert.equal(response.status, 503); assert.match(body.error, /ollama serve/); assert.match(body.error, /ollama pull modelo-prueba/);
  unavailable.closeAllConnections(); await new Promise(resolve => unavailable.close(resolve));
});

test('sirve los estáticos y el cliente no inserta HTML dinámico', async () => {
  const page = await call('/'); assert.equal(page.response.status, 200); assert.match(page.response.headers.get('content-type'), /text\/html/);
  const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8'); assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML/);
});
