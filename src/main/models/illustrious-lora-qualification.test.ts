import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import {
  inspectIllustriousLoraSafetensorsHeader,
  qualifyIllustriousLora,
} from './illustrious-lora-qualification.js'

type Descriptor = { data_offsets: [number, number]; dtype: string; shape: number[] }
type Header = Record<string, Descriptor>
const sourceHeader: Header = JSON.parse(
  gunzipSync(
    readFileSync(new URL('./test-fixtures/illustrious-lora-header.json.gz', import.meta.url)),
  ).toString(),
) as Header

/** Tensor facts copied from actual Digital Art Illustrious weights; no training metadata/weights. */
function sourceBytes(header: Header = structuredClone(sourceHeader)): [Buffer, number] {
  const bytes = Buffer.from(JSON.stringify(header))
  const payload = Math.max(...Object.values(header).map((tensor) => tensor.data_offsets[1]))
  return [bytes, 8 + bytes.length + payload]
}

function pack(
  entries: { alphaValue?: number; dtype?: string; key: string; shape: number[] }[],
): Buffer {
  let end = 0
  const header: Header = {}
  for (const entry of entries) {
    const length =
      entry.shape.reduce((size, dimension) => size * dimension, 1) *
      (entry.dtype === 'F16' || entry.dtype === 'BF16' ? 2 : 4)
    header[entry.key] = {
      data_offsets: [end, end + length],
      dtype: entry.dtype ?? 'F32',
      shape: entry.shape,
    }
    end += length
  }
  const bytes = Buffer.from(JSON.stringify(header))
  const output = Buffer.alloc(8 + bytes.length + end)
  output.writeBigUInt64LE(BigInt(bytes.length))
  bytes.copy(output, 8)
  for (const entry of entries) {
    if (entry.alphaValue !== undefined) {
      const offset = 8 + bytes.length + header[entry.key].data_offsets[0]
      if (entry.dtype === 'F16' || entry.dtype === 'BF16') {
        output.writeUInt16LE(entry.alphaValue, offset)
      } else {
        output.writeFloatLE(entry.alphaValue, offset)
      }
    }
  }
  return output
}
const attention = 'lora_unet_down_blocks_1_attentions_0_transformer_blocks_0_attn2_to_k'
function tiny(alphaValue = 1, dtype = 'F32'): Buffer {
  return pack([
    { key: `${attention}.lora_down.weight`, shape: [1, 2048] },
    { key: `${attention}.lora_up.weight`, shape: [640, 1] },
    { alphaValue, dtype, key: `${attention}.alpha`, shape: [] },
  ])
}

test('real Illustrious LoRA header qualifies every source tensor and both text encoders', () => {
  assert.equal(Object.keys(sourceHeader).length, 2958)
  assert.ok(Object.keys(sourceHeader).some((key) => key.startsWith('lora_te1_')))
  assert.ok(Object.keys(sourceHeader).some((key) => key.startsWith('lora_te2_')))
  assert.ok(Object.keys(sourceHeader).some((key) => key.startsWith('lora_unet_input_blocks_')))
  assert.doesNotThrow(() => inspectIllustriousLoraSafetensorsHeader(...sourceBytes()))
})

test('real source neighboring incompatible cross-attention dimension and missing pair fail', () => {
  for (const mutation of ['dimension', 'pair'] as const) {
    const header = structuredClone(sourceHeader)
    const key = Object.keys(header).find((name) => name.includes('attn2_to_k.lora_down.weight'))!
    assert.ok(key)
    if (mutation === 'dimension') {
      header[key].shape[1] = 768
    } else {
      delete header[key.replace('.lora_down.', '.lora_up.')]
    }
    assert.throws(() => inspectIllustriousLoraSafetensorsHeader(...sourceBytes(header)))
  }
})

test('empty, unknown algorithms, unknown targets and mixed naming cannot silently lose tensors', () => {
  for (const mutation of ['empty', 'algorithm', 'target', 'mixed'] as const) {
    const header = structuredClone(sourceHeader)
    if (mutation === 'empty') {
      for (const key of Object.keys(header)) {
        delete header[key]
      }
    } else {
      const key = Object.keys(header).find((name) => name.includes('lora_unet_input_blocks_4_'))!
      assert.ok(key)
      const moved =
        mutation === 'algorithm'
          ? key.replace('.lora_down.weight', '.hada_w1_a')
          : mutation === 'target'
            ? key.replace('input_blocks_4_', 'input_blocks_400_')
            : `${attention}.lora_down.weight`
      // Choose a down tensor, avoiding a no-op alpha substitution.
      const down =
        mutation === 'algorithm'
          ? Object.keys(header).find((name) => name.endsWith('.lora_down.weight'))!
          : key
      const finalKey =
        mutation === 'algorithm' ? down.replace('.lora_down.weight', '.hada_w1_a') : moved
      header[finalKey] = header[down]!
      delete header[down]
    }
    assert.throws(() => inspectIllustriousLoraSafetensorsHeader(...sourceBytes(header)), mutation)
  }
})

test('malformed offsets, gaps, dtype and header ceilings are refused at the header boundary', () => {
  for (const mutate of [
    (header: Header) => {
      Object.values(header)[0].data_offsets[0] = 1
    },
    (header: Header) => {
      Object.values(header)[0].dtype = 'I64'
    },
    (header: Header) => {
      Object.values(header)[0].shape[0] = -1
    },
  ]) {
    const header = structuredClone(sourceHeader)
    mutate(header)
    assert.throws(() => inspectIllustriousLoraSafetensorsHeader(...sourceBytes(header)))
  }
  assert.throws(() =>
    inspectIllustriousLoraSafetensorsHeader(Buffer.alloc(32 * 1024 * 1024 + 1), 1e8),
  )
  assert.throws(() => inspectIllustriousLoraSafetensorsHeader(Buffer.from('{invalid'), 100))
  assert.throws(() => inspectIllustriousLoraSafetensorsHeader(Buffer.from([123, 255, 125]), 100))
})

test('complete mixed namespace and two aliases for one target are independently refused', () => {
  const cases = [
    [
      {
        key: 'lora_unet_input_blocks_4_1_transformer_blocks_0_attn1_to_q.lora_down.weight',
        shape: [1, 640],
      },
      {
        key: 'lora_unet_input_blocks_4_1_transformer_blocks_0_attn1_to_q.lora_up.weight',
        shape: [640, 1],
      },
      { key: `${attention}.lora_down.weight`, shape: [1, 2048] },
      { key: `${attention}.lora_up.weight`, shape: [640, 1] },
    ],
    [
      { key: 'lora_unet_input_blocks_0_0.lora_down.weight', shape: [1, 4, 3, 3] },
      { key: 'lora_unet_input_blocks_0_0.lora_up.weight', shape: [320, 1, 1, 1] },
      { key: 'lora_unet_conv_in.lora_down.weight', shape: [1, 4, 3, 3] },
      { key: 'lora_unet_conv_in.lora_up.weight', shape: [320, 1, 1, 1] },
    ],
  ]
  for (const [index, entries] of cases.entries()) {
    const bytes = pack(entries)
    const length = Number(bytes.readBigUInt64LE())
    assert.throws(
      () => inspectIllustriousLoraSafetensorsHeader(bytes.subarray(8, 8 + length), bytes.length),
      index === 0 ? /mixes SGM/ : /same module/,
    )
  }
})

test('actual file qualification reads scalar alpha and rejects nonfinite F32/F16/BF16', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'igs-lora-qualifier-'))
  try {
    const file = path.join(folder, 'adapter.safetensors')
    for (const [dtype, good, bad] of [
      ['F32', -0.5, Infinity],
      ['F16', 0xbc_00, 0x7c_00],
      ['BF16', 0xbf_00, 0x7f_c0],
    ] as const) {
      await writeFile(file, tiny(good, dtype))
      await assert.doesNotReject(qualifyIllustriousLora(file))
      await writeFile(file, tiny(bad, dtype))
      await assert.rejects(qualifyIllustriousLora(file), /alpha scalar is not finite/)
    }
  } finally {
    await rm(folder, { force: true, recursive: true })
  }
})

test('actual ordinary convolution and CLIP pairs qualify; mismatched Conv rank and alpha vector fail', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'igs-lora-qualifier-'))
  try {
    const file = path.join(folder, 'adapter.safetensors')
    const entries = [
      { key: 'lora_unet_conv_in.lora_down.weight', shape: [1, 4, 3, 3] },
      { key: 'lora_unet_conv_in.lora_up.weight', shape: [320, 1, 1, 1] },
      {
        key: 'lora_te1_text_model_encoder_layers_0_self_attn_q_proj.lora_down.weight',
        shape: [1, 768],
      },
      {
        key: 'lora_te1_text_model_encoder_layers_0_self_attn_q_proj.lora_up.weight',
        shape: [768, 1],
      },
      {
        key: 'lora_te2_text_model_encoder_layers_0_self_attn_q_proj.lora_down.weight',
        shape: [1, 1280],
      },
      {
        key: 'lora_te2_text_model_encoder_layers_0_self_attn_q_proj.lora_up.weight',
        shape: [1280, 1],
      },
    ]
    await writeFile(file, pack(entries))
    await assert.doesNotReject(qualifyIllustriousLora(file))
    const wrongRank = structuredClone(entries)
    wrongRank[1].shape[1] = 2
    await writeFile(file, pack(wrongRank))
    await assert.rejects(qualifyIllustriousLora(file), /rank or dimensions/)
    await writeFile(file, pack([...entries, { key: 'lora_unet_conv_in.alpha', shape: [1] }]))
    await assert.rejects(qualifyIllustriousLora(file), /alpha must be a scalar/)
  } finally {
    await rm(folder, { force: true, recursive: true })
  }
})

test('actual filesystem qualification refuses symlink, non-safetensors and truncated/oversize headers', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'igs-lora-qualifier-'))
  try {
    const file = path.join(folder, 'adapter.safetensors')
    await writeFile(file, tiny())
    const link = path.join(folder, 'linked.safetensors')
    await symlink(file, link)
    await assert.rejects(qualifyIllustriousLora(link))
    await assert.rejects(qualifyIllustriousLora(`${file}.bin`), /not a safetensors/)
    for (const length of [32 * 1024 * 1024 + 1, 5]) {
      const invalid = Buffer.alloc(12)
      invalid.writeBigUInt64LE(BigInt(length))
      await writeFile(file, invalid)
      await assert.rejects(qualifyIllustriousLora(file), /header length/)
    }
  } finally {
    await rm(folder, { force: true, recursive: true })
  }
})
