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
    kind: { type: 'string', enum: kinds },
    commonName: { type: 'string', description: 'Most specific common name in Mexican Spanish, e.g. "Tucán real" rather than "Tucán".' },
    scientificName: { type: 'string', description: 'Binomial species name if reasonably sure, otherwise genus or family. Empty if unknown.' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    description: { type: 'string', description: 'Two or three plain sentences: what it is and the visible traits that identify it.' },
    lookFor: { type: 'array', items: { type: 'string', description: 'A short observable cue to check in the field (a feature, call, behaviour or a related species nearby).' }, minItems: 2, maxItems: 4 },
    safety: { type: 'string', description: 'One or two plain sentences only if this organism poses a specific risk; otherwise an empty string.' },
    fieldQuest: { type: 'string', description: 'One concrete 5 to 10 minute outdoor activity related to this organism that keeps the user exploring, written as an instruction.' }
  },
  required: ['kind', 'commonName', 'scientificName', 'confidence', 'description', 'lookFor', 'safety', 'fieldQuest']
};
export const questSchema = {
  type: 'object', additionalProperties: false,
  properties: { title: string, steps: { type: 'array', items: string, minItems: 3, maxItems: 5 }, safety: string },
  required: ['title', 'steps', 'safety']
};
