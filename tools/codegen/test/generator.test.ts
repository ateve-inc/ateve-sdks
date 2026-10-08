import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { render, loadContract, banner } from '../src/generator.ts';
import { synchronize } from '../src/files.ts';
import type { Schema } from '../src/types.ts';

test('generation is deterministic and preserves language-specific model shapes', () => {
  const [api, bindings] = loadContract();
  const first = render(api, bindings);
  assert.deepEqual(first, render(api, bindings));
  assert.match(first.js['src/types.ts'], /width: number \| null/);
  assert.match(first.python['src/ateve/models.py'], /width: Optional\[int\] = None/);
  assert.match(first.python['src/ateve/models.py'], /published_at: Optional\[datetime\]/);
  const java = first.java['src/main/java/ai/ateve/models/SearchRequest.java'];
  assert.match(java, /List.copyOf\(b.includeDomains\)/);
  assert.match(java, /public static final class Builder/);
  assert.match(first.java['src/main/java/ai/ateve/models/SearchResponse.java'], /private Long created/);
  assert.match(first.java['src/main/java/ai/ateve/models/SearchResult.java'], /InstantMillis.Deserializer.class/);
});

test('adding and removing fields updates all three language outputs', () => {
  const [api, bindings] = loadContract();
  api.components.schemas.VideoItem.properties!.provider_name = { type: 'string' };
  let generated = render(api, bindings);
  assert.match(generated.js['src/types.ts'], /providerName\?: string/);
  assert.match(generated.python['src/ateve/models.py'], /provider_name: Optional\[str\]/);
  assert.match(generated.java['src/main/java/ai/ateve/models/VideoItem.java'], /String providerName\(\)/);
  delete api.components.schemas.VideoItem.properties!.provider_name;
  generated = render(api, bindings);
  for (const lang of Object.values(generated)) assert.doesNotMatch(Object.values(lang).join('\n'), /provider_name|providerName/);
});

test('new models are generated and exported without a duplicated model registry', () => {
  const [api, bindings] = loadContract();
  api.components.schemas.SearchMetadata = { type: 'object', 'x-sdk-kind': 'response', properties: { source: { type: 'string' } } };
  const generated = render(api, bindings);
  assert.match(generated.js['src/types.ts'], /interface SearchMetadata/);
  assert.match(generated.python['src/ateve/_model_exports.py'], /"SearchMetadata"/);
  assert.ok(generated.java['src/main/java/ai/ateve/models/SearchMetadata.java']);
});

test('unsupported structures, unresolved references and stale bindings fail closed', () => {
  const cases: [Schema, RegExp][] = [
    [{ oneOf: [{ type: 'string' }] }, /Unsupported keyword oneOf/],
    [{ type: ['string', 'integer'] }, /Unsupported union/],
    [{ $ref: '#/components/schemas/Missing' }, /Unresolved reference/],
  ];
  for (const [property, error] of cases) {
    const [api, bindings] = loadContract();
    api.components.schemas.VideoItem.properties!.new_field = property;
    assert.throws(() => render(api, bindings), error);
  }
  const [api, bindings] = loadContract();
  delete api.components.schemas.ImageItem.properties!.width;
  api.components.schemas.ImageItem.required = api.components.schemas.ImageItem.required!.filter((name) => name !== 'width');
  assert.throws(() => render(api, bindings), /Unknown field binding ImageItem.width/);
  const [otherApi, otherBindings] = loadContract();
  otherBindings.fields!['ImageItem.width'].python!.nullable = true;
  assert.throws(() => render(otherApi, otherBindings), /Unsupported Python binding/);
});

test('read-only checking detects changed, missing and extra generated files; sync removes obsolete files', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'ateve-codegen-'));
  try {
    const old = { 'src/Old.java': `// ${banner}\nclass Old {}\n` };
    const next = { 'src/New.java': `// ${banner}\nclass New {}\n` };
    synchronize(base, old);
    const before = readFileSync(path.join(base, 'src/Old.java'), 'utf8');
    assert.throws(() => synchronize(base, next, true), /obsolete: src\/Old.java/);
    assert.equal(readFileSync(path.join(base, 'src/Old.java'), 'utf8'), before);
    assert.equal(existsSync(path.join(base, 'src/New.java')), false);
    synchronize(base, next);
    assert.equal(existsSync(path.join(base, 'src/Old.java')), false);
    synchronize(base, next, true);
    writeFileSync(path.join(base, 'src/New.java'), `// ${banner}\nmanual change\n`);
    assert.throws(() => synchronize(base, next, true), /changed or missing/);
    rmSync(path.join(base, 'src/New.java'));
    assert.throws(() => synchronize(base, next, true), /changed or missing/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('cleanup refuses to delete handwritten files or escape the output directory', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'ateve-codegen-'));
  try {
    synchronize(base, { 'src/Old.java': `// ${banner}\n` });
    writeFileSync(path.join(base, 'src/Old.java'), 'handwritten');
    assert.throws(() => synchronize(base, {}), /Refusing to remove/);
    assert.throws(() => synchronize(base, { 'src/../../escape': '' }), /Unsafe generated path/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
