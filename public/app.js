const state = { result: null, image: null, places: [] };
const $ = selector => document.querySelector(selector);

function addText(parent, tag, text, className = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('is-active', tab.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(panel => {
    const visible = panel.id === name;
    panel.hidden = !visible;
    panel.classList.toggle('is-visible', visible);
  });
  if (name === 'journal') loadJournal();
}

function renderResult(result) {
  const container = $('#identify-result');
  container.replaceChildren();
  const card = document.createElement('article');
  card.className = 'result-card';
  addText(card, 'h3', result.commonName || 'Sin identificación');
  addText(card, 'p', result.scientificName, 'scientific');
  addText(card, 'span', `Confianza: ${result.confidence}`, `confidence ${result.confidence}`);
  addText(card, 'p', result.description);
  if (result.lookFor.length) {
    addText(card, 'h4', 'Busca también');
    const list = document.createElement('ul');
    result.lookFor.forEach(item => addText(list, 'li', item));
    card.append(list);
  }
  if (result.safety) addText(card, 'p', `Seguridad: ${result.safety}`, 'safety');
  if (result.fieldQuest) addText(card, 'p', `Misión de campo: ${result.fieldQuest}`, 'quest-note');
  const actions = document.createElement('div');
  actions.className = 'actions';
  const save = document.createElement('button');
  save.className = 'primary'; save.textContent = 'Guardar en mi diario'; save.addEventListener('click', saveResult);
  const again = document.createElement('button');
  again.textContent = 'Otra foto'; again.addEventListener('click', () => $('#photo').click());
  actions.append(save, again); card.append(actions); container.append(card);
}

function resizeImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    image.src = URL.createObjectURL(file);
  });
}

async function identify(event) {
  const file = event.target.files[0]; if (!file) return;
  $('#identify-status').textContent = 'Pensando en el dispositivo… (sin internet)';
  $('#identify-result').replaceChildren();
  try { state.image = await resizeImage(file, 1024, 0.8); state.result = await request('/api/identify', { method: 'POST', body: JSON.stringify({ image: state.image }) }); renderResult(state.result); $('#identify-status').textContent = ''; }
  catch (error) { $('#identify-status').textContent = error.message; }
  event.target.value = '';
}

async function saveResult() {
  try { await request('/api/journal', { method: 'POST', body: JSON.stringify({ result: state.result, thumbnail: await resizeImage(await fetch(state.image).then(response => response.blob()), 256, 0.75), placeId: $('#place').value || 'cerca' }) }); $('#identify-status').textContent = 'Guardado en tu diario.'; }
  catch (error) { $('#identify-status').textContent = error.message; }
}

function renderQuest(quest) {
  const container = $('#quest-result'); container.replaceChildren();
  const card = document.createElement('article'); card.className = 'result-card'; addText(card, 'h3', quest.title);
  const list = document.createElement('ol');
  quest.steps.forEach(step => { const item = document.createElement('li'); const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; label.append(checkbox, document.createTextNode(` ${step}`)); item.append(label); list.append(item); });
  card.append(list); if (quest.safety) addText(card, 'p', `Seguridad: ${quest.safety}`, 'safety'); container.append(card);
}

async function getQuest() { $('#quest-status').textContent = 'Preparando una misión local…'; try { const quest = await request('/api/quest', { method: 'POST', body: JSON.stringify({ placeId: $('#place').value, minutes: Number($('#minutes').value) }) }); renderQuest(quest); $('#quest-status').textContent = ''; } catch (error) { $('#quest-status').textContent = error.message; } }

async function loadJournal() {
  const container = $('#journal-list'); container.replaceChildren();
  try { const entries = await request('/api/journal'); if (!entries.length) { addText(container, 'p', 'Todavía no hay observaciones guardadas.'); return; } entries.forEach(entry => { const card = document.createElement('article'); card.className = 'journal-card'; if (entry.thumbnail) { const image = document.createElement('img'); image.src = entry.thumbnail; image.alt = 'Miniatura de la observación'; card.append(image); } addText(card, 'h3', entry.result.commonName || 'Sin identificación'); addText(card, 'p', new Date(entry.createdAt).toLocaleString(), 'date'); const place = state.places.find(item => item.id === entry.placeId); if (place) addText(card, 'p', place.name); const remove = document.createElement('button'); remove.textContent = 'Borrar'; remove.addEventListener('click', async () => { if (confirm('¿Borrar esta observación?')) { await request(`/api/journal/${encodeURIComponent(entry.id)}`, { method: 'DELETE' }); loadJournal(); } }); card.append(remove); container.append(card); }); } catch (error) { addText(container, 'p', error.message, 'status'); }
}

async function loadInitialData() {
  try { const health = await request('/api/health'); $('#health').textContent = health.ollama ? 'Modelo local listo' : 'Ollama no responde'; $('#health').classList.toggle('offline', !health.ollama); } catch { $('#health').textContent = 'Ollama no responde'; $('#health').classList.add('offline'); }
  try { state.places = await request('/api/places'); state.places.forEach(place => { const option = document.createElement('option'); option.value = place.id; option.textContent = `${place.name} · ${place.municipality}`; $('#place').append(option); }); } catch (error) { $('#quest-status').textContent = error.message; }
}

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
$('#photo').addEventListener('change', identify); $('#quest-button').addEventListener('click', getQuest); loadInitialData();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
