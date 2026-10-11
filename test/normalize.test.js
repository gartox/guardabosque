import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdentification, normalizeQuest } from '../src/normalize.js';

test('normaliza una salida adversaria con tipos, HTML y campos extra', () => {
  const result = normalizeIdentification({ kind: 'dragon', commonName: '<img src=x>', scientificName: 4, confidence: 'certain', description: 'x'.repeat(700), lookFor: ['uno', 2, 'dos', 'tres', 'cuatro', 'cinco'], safety: null, fieldQuest: undefined, extra: 'descartar' });
  assert.deepEqual(result, { kind: 'unknown', commonName: '<img src=x>', scientificName: '', confidence: 'low', description: 'x'.repeat(600), lookFor: ['uno', 'dos', 'tres', 'cuatro'], safety: '', fieldQuest: '' });
});

test('completa una misión incompleta con pasos seguros', () => {
  const result = normalizeQuest({ title: 7, steps: ['Mira de lejos'], extra: true });
  assert.equal(result.title, ''); assert.equal(result.steps.length, 3); assert.match(result.steps[1], /sin tocar/); assert.equal(result.safety, '');
});
