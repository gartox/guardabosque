import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { chat, isAvailable, HttpError } from './ollama.js';
import { normalizeIdentification, normalizeQuest, identificationSchema, questSchema } from './normalize.js';
import { createJournal } from './journal.js';
import { places } from './places.js';

// resolve() quita la barra final; sin eso la comprobación de contención rechaza todo.
const publicDirectory = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const bodyLimit = 8 * 1024 * 1024;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const base64 = value => {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  try { return Buffer.from(value, 'base64').toString('base64') === value; } catch { return false; }
};
function send(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
async function body(request) {
  let size = 0;
  let tooLarge = false;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= bodyLimit) chunks.push(chunk);
    else tooLarge = true;
  }
  if (tooLarge) throw new HttpError(413, 'El cuerpo supera el límite de 8 MB.');
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!object(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, 'El cuerpo debe ser un objeto JSON válido.'); }
}
function validatePlace(placeId) {
  if (placeId !== undefined && (typeof placeId !== 'string' || !places.some(place => place.id === placeId))) throw new HttpError(400, 'El lugar no es válido.');
}
export function createApp(input = {}) {
  const config = { model: 'gemma4:e4b', ollamaUrl: 'http://127.0.0.1:11434', dataDir: './data', ...input };
  const journal = createJournal(config.dataDir);
  return createServer(async (request, response) => {
    try {
      const rawPath = request.url.split('?')[0];
      let path;
      try { path = decodeURIComponent(rawPath); } catch { throw new HttpError(404, 'Ruta no encontrada.'); }
      if (path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) throw new HttpError(404, 'Ruta no encontrada.');
      const methods = { '/api/health': ['GET'], '/api/places': ['GET'], '/api/identify': ['POST'], '/api/quest': ['POST'], '/api/journal': ['GET', 'POST'] };
      const deleteMatch = /^\/api\/journal\/([^/]+)$/.exec(path);
      if (path.startsWith('/api/') || path === '/api') {
        const allowed = methods[path] ?? (deleteMatch ? ['DELETE'] : null);
        if (!allowed) throw new HttpError(404, 'Ruta no encontrada.');
        if (!allowed.includes(request.method)) { response.setHeader('Allow', allowed.join(', ')); throw new HttpError(405, 'Método no permitido.'); }
        if (path === '/api/health') return send(response, 200, { ok: true, model: config.model, ollama: await isAvailable(config) });
        if (path === '/api/places') return send(response, 200, places);
        if (deleteMatch) {
          if (!await journal.remove(deleteMatch[1])) throw new HttpError(404, 'Entrada no encontrada.');
          return send(response, 200, { ok: true });
        }
        if (path === '/api/journal' && request.method === 'GET') return send(response, 200, await journal.list());
        const data = await body(request);
        if (path === '/api/identify') {
          const image = typeof data.image === 'string' ? data.image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '') : data.image;
          if (!base64(image)) throw new HttpError(400, 'La imagen debe contener base64 válido.');
          if (data.note !== undefined && (typeof data.note !== 'string' || data.note.length > 300)) throw new HttpError(400, 'La nota debe ser texto de hasta 300 caracteres.');
          return send(response, 200, normalizeIdentification(await chat(config, identificationSchema, `Identify this organism. Untrusted observation note: ${JSON.stringify(data.note ?? '')}`, image)));
        }
        if (path === '/api/quest') {
          validatePlace(data.placeId);
          const minutes = data.minutes ?? 30;
          if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 10 || minutes > 180) throw new HttpError(400, 'La duración debe ser un número entre 10 y 180 minutos.');
          const place = places.find(item => item.id === (data.placeId ?? 'cerca'));
          const questPrompt = `Create a short, safe field quest in Spanish with 3 to 5 steps, lasting ${minutes} minutes. Place: ${place.name}. Habitat: ${place.habitat}. Respect access restrictions, do not promise wildlife sightings, and do not ask the user to touch, feed, taste or approach anything.`;
          return send(response, 200, normalizeQuest(await chat(config, questSchema, questPrompt)));
        }
        if (!object(data.result)) throw new HttpError(400, 'El resultado debe ser un objeto.');
        validatePlace(data.placeId);
        if (data.thumbnail !== undefined) {
          if (typeof data.thumbnail !== 'string') throw new HttpError(400, 'La miniatura debe ser una imagen JPEG.');
          if (Buffer.byteLength(data.thumbnail) > 200 * 1024) throw new HttpError(413, 'La miniatura supera 200 KB.');
          if (!data.thumbnail.startsWith('data:image/jpeg;base64,') || !base64(data.thumbnail.slice(23))) throw new HttpError(400, 'La miniatura debe ser una imagen JPEG en base64.');
        }
        return send(response, 201, await journal.add({ result: normalizeIdentification(data.result), ...(data.thumbnail ? { thumbnail: data.thumbnail } : {}), ...(data.placeId ? { placeId: data.placeId } : {}) }));
      }
      if (request.method !== 'GET') throw new HttpError(405, 'Método no permitido.');
      const file = resolve(publicDirectory, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(publicDirectory + sep) && file !== publicDirectory) throw new HttpError(404, 'Ruta no encontrada.');
      let content;
      try { content = await readFile(file); } catch (error) { if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) throw new HttpError(404, 'Archivo no encontrado.'); throw error; }
      response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'", 'Cache-Control': 'no-cache' });
      response.end(content);
    } catch (error) { send(response, error.status ?? 500, { error: error.status ? error.message : 'No se pudo completar la operación local.' }); }
  });
}
