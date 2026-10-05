import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { gunzipSync } from 'node:zlib'

import {
  inspectAnimaSafetensorsHeader,
  qualifyAnimaCheckpoint,
} from './anima-checkpoint-qualification.js'

// Captured trained-model tensor descriptors, independently checked against actual native
// CosmosTransformer3DModel + AnimaTextConditioner state schemas. Metadata has been removed.
// This test exercises only the bounded header boundary, not payload loading or training quality.
const captured = JSON.parse(
  gunzipSync(
    readFileSync(new URL('./test-fixtures/anima-base-1-header.json.gz', import.meta.url)),
  ).toString('utf8'),
) as Record<string, { data_offsets: [number, number]; dtype: string; shape: number[] }>

function header(input: Record<string, unknown> = captured): { bytes: Buffer; size: number } {
  const bytes = Buffer.from(JSON.stringify(input))
  const ends = Object.values(input)
    .filter(
      (value): value is { data_offsets: number[] } =>
        typeof value === 'object' && value !== null && 'data_offsets' in value,
    )
    .map((value) => value.data_offsets[1] ?? 0)
  return { bytes, size: 8 + bytes.length + Math.max(...ends) }
}

test('full native-confirmed custom Anima header passes without a checkpoint hash allowlist', () => {
  const sample = header()
  inspectAnimaSafetensorsHeader(sample.bytes, sample.size)
  assert.equal(Object.keys(captured).length, 685)
})

test('official net, bare and bundled model.diffusion_model layouts preserve the same architecture', () => {
  for (const prefix of ['', 'net.', 'model.diffusion_model.']) {
    const renamed = Object.fromEntries(
      Object.entries(captured).map(([key, value]) => [
        prefix + key.slice('model.diffusion_model.'.length),
        value,
      ]),
    )
    const sample = header(renamed)
    inspectAnimaSafetensorsHeader(sample.bytes, sample.size)
    const end = Math.max(...Object.values(renamed).map((tensor) => tensor.data_offsets[1]))
    let offset = end
    for (const name of [
      `${prefix}llm_adapter.rotary_emb.inv_freq`,
      `${prefix}pos_embedder.dim_spatial_range`,
      'model_sampling.sigma_min',
      ...(prefix === 'model.diffusion_model.'
        ? ['first_stage_model.decoder.weight', 'cond_stage_model.encoder.weight']
        : []),
    ]) {
      renamed[name] = { data_offsets: [offset, offset + 2], dtype: 'F16', shape: [1] }
      offset += 2
    }
    const exported = header(renamed)
    inspectAnimaSafetensorsHeader(exported.bytes, exported.size)
    renamed[`${prefix}unsupported_connector.inv_freq`] = {
      data_offsets: [offset, offset + 2],
      dtype: 'F16',
      shape: [1],
    }
    const unknown = header(renamed)
    assert.throws(() => inspectAnimaSafetensorsHeader(unknown.bytes, unknown.size))
  }
})

test('wrong backbone or adapter, missing and unexpected trainable tensors fail', () => {
  for (const key of [
    'model.diffusion_model.x_embedder.proj.1.weight',
    'model.diffusion_model.llm_adapter.embed.weight',
    'model.diffusion_model.blocks.27.cross_attn.k_norm.weight',
  ]) {
    assert.ok(captured[key], key)
    for (const change of ['missing', 'shape'] as const) {
      const modified = structuredClone(captured)
      if (change === 'missing') {
        delete modified[key]
      } else {
        const shape = modified[key].shape
        modified[key].shape = shape.length === 1 ? [shape[0], 1] : [...shape].reverse()
      }
      const sample = header(modified)
      assert.throws(() => inspectAnimaSafetensorsHeader(sample.bytes, sample.size))
    }
  }
  const modified = structuredClone(captured)
  const end = Math.max(...Object.values(captured).map((tensor) => tensor.data_offsets[1]))
  modified['model.diffusion_model.unknown_trainable.weight'] = {
    data_offsets: [end, end + 2],
    dtype: 'BF16',
    shape: [1],
  }
  const sample = header(modified)
  assert.throws(() => inspectAnimaSafetensorsHeader(sample.bytes, sample.size))
  for (const name of ['toString', 'constructor', '__proto__']) {
    const inherited = {
      ...captured,
      [`model.diffusion_model.${name}`]: { data_offsets: [end, end + 2], dtype: 'BF16', shape: [] },
    }
    const invalid = header(inherited)
    assert.throws(() => inspectAnimaSafetensorsHeader(invalid.bytes, invalid.size))
  }
})

test('non-floating weights and invalid, overlapping or incomplete payload ranges fail', () => {
  const keys = Object.keys(captured)
  for (const mode of ['dtype', 'overlap', 'gap', 'outside'] as const) {
    const modified = structuredClone(captured)
    const first = modified[keys[0]]
    const second = modified[keys[1]]
    if (mode === 'dtype') {
      first.dtype = 'I16'
    }
    if (mode === 'overlap') {
      second.data_offsets = [0, second.data_offsets[1] - second.data_offsets[0]]
    }
    if (mode === 'gap') {
      first.data_offsets = first.data_offsets.map((value) => value + 2) as [number, number]
    }
    const sample = header(modified)
    assert.throws(() =>
      inspectAnimaSafetensorsHeader(
        sample.bytes,
        mode === 'outside' ? sample.size - 1 : sample.size,
      ),
    )
  }
  const trailing = header()
  assert.throws(() => inspectAnimaSafetensorsHeader(trailing.bytes, trailing.size + 2))
})

test('ambiguous prefixes, duplicate JSON fields and non-string metadata fail', () => {
  const sample = header()
  const first = Object.keys(captured)[0]
  const duplicate = Buffer.from(
    sample.bytes
      .toString('utf8')
      .replace('{', `{${JSON.stringify(first)}:${JSON.stringify(captured[first])},`),
  )
  assert.throws(() =>
    inspectAnimaSafetensorsHeader(duplicate, sample.size + duplicate.length - sample.bytes.length),
  )
  const nestedDuplicate = Buffer.from(
    sample.bytes.toString('utf8').replace('"dtype":', '"dtype":"F16","dtype":'),
  )
  assert.throws(() =>
    inspectAnimaSafetensorsHeader(
      nestedDuplicate,
      sample.size + nestedDuplicate.length - sample.bytes.length,
    ),
  )
  assert.throws(() => inspectAnimaSafetensorsHeader(Buffer.from([123, 255, 125]), sample.size))
  for (const modified of [
    { ...captured, [`net.${first.slice('model.diffusion_model.'.length)}`]: captured[first] },
    { ...captured, __metadata__: { invalid: 1 } },
    { ...captured, 'unrelated_model.weight': captured[first] },
  ]) {
    const invalid = header(modified)
    assert.throws(() => inspectAnimaSafetensorsHeader(invalid.bytes, invalid.size))
  }
})

test('file entrypoint reads bounded regular safetensors headers and refuses links or truncation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'igs-anima-header-'))
  try {
    const sample = header()
    const file = path.join(directory, 'custom.safetensors')
    const handle = await open(file, 'wx')
    try {
      const length = Buffer.alloc(8)
      length.writeBigUInt64LE(BigInt(sample.bytes.length))
      await handle.write(Buffer.concat([length, sample.bytes]))
      await handle.truncate(sample.size)
    } finally {
      await handle.close()
    }
    await qualifyAnimaCheckpoint(file)
    const link = path.join(directory, 'linked.safetensors')
    await symlink(file, link)
    await assert.rejects(qualifyAnimaCheckpoint(link))
    await writeFile(file, Buffer.from([8, 0, 0, 0, 0, 0, 0, 0]))
    await assert.rejects(qualifyAnimaCheckpoint(file))
    await assert.rejects(qualifyAnimaCheckpoint(path.join(directory, 'unsafe.pkl')))
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})
