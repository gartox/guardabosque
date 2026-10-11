export const kinds = ['plant', 'bird', 'insect', 'reptile', 'amphibian', 'mammal', 'fish', 'fungus', 'other', 'unknown'];
const cleanText = value => typeof value === 'string' ? value.slice(0, 600) : '';
const cleanList = (value, maximum) => Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, maximum).map(cleanText) : [];
const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function normalizeIdentification(value) {
  const data = asObject(value);
  return {
    kind: kinds.includes(data.kind) ? data.kind : 'unknown',
    commonName: cleanText(data.commonName),
    scientificName: cleanText(data.scientificName),
    confidence: ['low', 'medium', 'high'].includes(data.confidence) ? data.confidence : 'low',
    description: cleanText(data.description),
    lookFor: cleanList(data.lookFor, 4),
    safety: cleanText(data.safety),
    fieldQuest: cleanText(data.fieldQuest)
  };
}

export function normalizeQuest(value) {
  const data = asObject(value);
  const steps = cleanList(data.steps, 5);
  const defaults = ['Camina por un sendero permitido.', 'Observa a distancia sin tocar ni alimentar fauna.', 'Regresa por el mismo camino y recoge tus residuos.'];
  while (steps.length < 3) steps.push(defaults[steps.length]);
  return { title: cleanText(data.title), steps, safety: cleanText(data.safety) };
}

const string = { type: 'string' };
export const identificationSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: kinds }, commonName: string, scientificName: string,
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    description: string, lookFor: { type: 'array', items: string, maxItems: 4 },
    safety: string, fieldQuest: string
  },
  required: ['kind', 'commonName', 'scientificName', 'confidence', 'description', 'lookFor', 'safety', 'fieldQuest']
};
export const questSchema = {
  type: 'object', additionalProperties: false,
  properties: { title: string, steps: { type: 'array', items: string, minItems: 3, maxItems: 5 }, safety: string },
  required: ['title', 'steps', 'safety']
};
