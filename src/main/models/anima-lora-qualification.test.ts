import assert from 'node:assert/strict'
import { createHook } from 'node:async_hooks'
import { execFileSync } from 'node:child_process'
import { readFileSync, utimesSync } from 'node:fs'
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import {
  AnimaLoraQualificationError,
  inspectAnimaLoraSafetensorsHeader,
  qualifyAnimaLora,
} from './anima-lora-qualification.js'
import { ANIMA_LORA_TARGET_PROFILE } from './anima-lora-target-profile.js'
import { animaLoraFixture, packAnimaLora } from './test-fixtures/anima-lora.js'

type Header = Record<string, { data_offsets: [number, number]; dtype: string; shape: number[] }>
type Entry = { dtype?: 'BF16' | 'F16' | 'F32'; key: string; shape: number[] }
const kohya = 'lora_unet_blocks_0_cross_attn_k_proj'
const original = 'diffusion_model.blocks.0.cross_attn.k_proj'
const native = 'transformer.transformer_blocks.0.attn2.to_k'
function pair(stem = kohya, shape: readonly number[] = [2048, 1024], rank = 1): Entry[] {
  const [down, up] = stem.startsWith('lora_')
    ? ['lora_down.weight', 'lora_up.weight']
    : ['lora_A.weight', 'lora_B.weight']
  return [
    { key: `${stem}.${down}`, shape: [rank, shape[1]] },
    { key: `${stem}.${up}`, shape: [shape[0], rank] },
  ]
}
function header(entries: Entry[] = pair()): Header {
  let end = 0
  return Object.fromEntries(
    entries.map((entry) => {
      const dtype = entry.dtype ?? 'F32'
      const size =
        entry.shape.reduce((total, dimension) => total * dimension, 1) *
        (dtype === 'BF16' || dtype === 'F16' ? 2 : 4)
      const value = {
        data_offsets: [end, end + size] as [number, number],
        dtype,
        shape: entry.shape,
      }
      end += size
      return [entry.key, value]
    }),
  )
}
function inspect(
  source: Header,
  payloadBytes = Math.max(...Object.values(source).map((tensor) => tensor.data_offsets[1]), 4),
): void {
  const bytes = Buffer.from(JSON.stringify(source))
  inspectAnimaLoraSafetensorsHeader(bytes, 8 + bytes.length + payloadBytes)
}

test('Anima ordinary Kohya cross-attention dimensions qualify against the actual native profile', () => {
  const header = Buffer.from(
    JSON.stringify({
      'lora_unet_blocks_0_cross_attn_k_proj.lora_down.weight': {
        data_offsets: [0, 4096],
        dtype: 'F32',
        shape: [1, 1024],
      },
      'lora_unet_blocks_0_cross_attn_k_proj.lora_up.weight': {
        data_offsets: [4096, 12_288],
        dtype: 'F32',
        shape: [2048, 1],
      },
    }),
  )
  assert.doesNotThrow(() => inspectAnimaLoraSafetensorsHeader(header, 8 + header.length + 12_288))
})

test('generated TS and packaged Python profiles agree on all 711 actual native Linear targets and 4977 unique aliases', () => {
  const packaged = JSON.parse(
    readFileSync(
      new URL(
        '../../../worker-python/src/imagegen_worker/resources/anima_lora_targets.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown
  assert.deepEqual(packaged, ANIMA_LORA_TARGET_PROFILE)
  assert.equal(ANIMA_LORA_TARGET_PROFILE.length, 711)
  assert.deepEqual(
    ['qwen3_encoder', 'text_conditioner', 'transformer'].map(
      (component) =>
        ANIMA_LORA_TARGET_PROFILE.filter((target) => target.target.startsWith(`${component}.`))
          .length,
    ),
    [196, 61, 454],
  )
  const targets = new Set<string>()
  const aliases = new Set<string>()
  for (const entry of ANIMA_LORA_TARGET_PROFILE) {
    assert.ok(!targets.has(entry.target))
    targets.add(entry.target)
    assert.ok(
      !entry.target.startsWith('vae.') &&
        !entry.target.endsWith('.embed') &&
        !entry.target.endsWith('.embed_tokens'),
    )
    for (const alias of entry.aliases) {
      assert.ok(!aliases.has(alias), alias)
      aliases.add(alias)
      // Header-only declared payloads exercise each finite alias without allocating model weights.
      assert.doesNotThrow(() => inspect(header(pair(alias, entry.shape))), alias)
    }
  }
  assert.equal(aliases.size, 4977)
})

for (const [fixture, count, style] of [
  ['myth', 896, 'peft'],
  ['artistic', 896, 'peft'],
  ['venom', 840, 'kohya'],
] as const) {
  test(`actual local ${fixture} Anima adapter header qualifies all ${count} tensors in ${style} style`, () => {
    // Only source descriptors are copied. No training metadata or reusable weight payload is stored.
    const source = JSON.parse(
      gunzipSync(
        readFileSync(
          new URL(`./test-fixtures/anima-lora-${fixture}-header.json.gz`, import.meta.url),
        ),
      ).toString(),
    ) as Header
    assert.equal(Object.keys(source).length, count)
    assert.doesNotThrow(() => inspect(source))
    const broken = structuredClone(source)
    const down = Object.keys(broken).find((key) =>
      key.endsWith(style === 'peft' ? '.lora_A.weight' : '.lora_down.weight'),
    )!
    broken[down].shape[1] -= 1
    assert.throws(() => inspect(broken), AnimaLoraQualificationError)
  })
}

test('backbone, split conditioner and bare Qwen support both exact ordinary namespaces and isolated targets', () => {
  for (const entries of [
    pair('lora_unet_llm_adapter_blocks_5_mlp_0', [4096, 1024], 2),
    pair('text_conditioner.blocks.5.mlp.0', [4096, 1024], 2),
    pair('lora_te_layers_27_self_attn_q_proj', [2048, 1024], 2),
    pair('text_encoder.model.layers.27.self_attn.q_proj', [2048, 1024], 2),
    pair('lora_unet_x_embedder_proj_1', [2048, 68], 2),
    pair('transformer.proj_out', [64, 2048], 2),
  ]) {
    assert.doesNotThrow(() => inspect(header(entries)))
  }
})

test('complete independent namespaces qualify alone while alias collisions and global mixed styles refuse', () => {
  for (const stem of [original, native, kohya]) {
    assert.doesNotThrow(() => inspect(header(pair(stem))))
  }
  assert.throws(
    () => inspect(header([...pair(original), ...pair(native)])),
    /aliases target the same/,
  )
  assert.throws(
    () =>
      inspect(
        header([...pair(original), ...pair('lora_te_layers_0_self_attn_k_proj', [1024, 1024])]),
      ),
    /mixes Kohya and PEFT/,
  )
  for (const entries of [
    pair(original).map((entry) => ({
      ...entry,
      key: entry.key.replace('.lora_A.', '.lora_down.').replace('.lora_B.', '.lora_up.'),
    })),
    pair(kohya).map((entry) => ({
      ...entry,
      key: entry.key.replace('.lora_down.', '.lora_A.').replace('.lora_up.', '.lora_B.'),
    })),
  ]) {
    assert.throws(() => inspect(header(entries)), /suffix does not match/)
  }
})

test('rank and loaded-module input/output shapes are independently qualified with valid neighboring ranks', () => {
  for (const rank of [1, 2, 64]) {
    assert.doesNotThrow(() => inspect(header(pair(original, [2048, 1024], rank))))
  }
  for (const shape of [
    [1, 1023],
    [0, 1024],
    [1.5, 1024],
    [1, 1024, 1],
    [1024, 1],
  ]) {
    const entries = pair(original)
    entries[0].shape = shape
    assert.throws(() => inspect(header(entries)))
  }
  for (const shape of [
    [2047, 1],
    [2048, 2],
    [2048, 1, 1],
  ]) {
    const entries = pair(original)
    entries[1].shape = shape
    assert.throws(() => inspect(header(entries)))
  }
  assert.throws(() => inspect(header(pair(original).slice(0, 1))), /missing its complete/)
  assert.throws(
    () => inspect(header([...pair(original), { key: `${original}.alpha`, shape: [1] }])),
    /alpha must be a scalar/,
  )
})

test('every additional algorithm or unknown branch refuses despite a complete valid neighboring pair', () => {
  for (const suffix of [
    'dora_scale',
    'dora_magnitude',
    'hada_w1_a',
    'lokr_w1',
    'on_input',
    'diff',
    'w_norm',
    'lora_mid.weight',
    'lora_A.default.weight',
    'bundle_emb.weight',
  ]) {
    assert.throws(
      () => inspect(header([...pair(original), { key: `${original}.${suffix}`, shape: [1] }])),
      suffix,
    )
  }
  for (const stem of [
    'vae.decoder.conv_out',
    'qwen3_encoder.embed_tokens',
    'text_conditioner.embed',
    'transformer.transformer_blocks.0.attn1.norm_q',
    'lora_te_layers_28_self_attn_k_proj',
  ]) {
    assert.throws(() => inspect(header(pair(stem, [1024, 1024]))), /Unsupported pinned/)
  }
  assert.throws(() => inspect({}), /empty/)
})

test('malformed storage ranges, unsupported dtypes and descriptor extras cannot lose payload bytes', () => {
  for (const mutate of [
    (source: Header) => {
      Object.values(source)[0].dtype = 'I64'
      // Keep this integer descriptor's eight-byte storage internally valid so
      // the dtype guard, rather than an unrelated byte-count mismatch, owns refusal.
      Object.values(source)[0].data_offsets = [0, 8192]
      Object.values(source)[1].data_offsets = [8192, 16_384]
    },
    (source: Header) => {
      Object.values(source)[0].data_offsets[0] = -1
    },
    (source: Header) => {
      Object.values(source)[0].data_offsets[0] = 0.5
    },
    (source: Header) => {
      Object.values(source)[0].data_offsets[1] -= 1
    },
    (source: Header) => {
      Object.values(source)[0].shape = [Number.MAX_SAFE_INTEGER, 1024]
    },
    (source: Header) => {
      Object.assign(Object.values(source)[0], { unknown: true })
    },
    (source: Header) => {
      for (const tensor of Object.values(source)) {
        tensor.data_offsets[0] += 4
        tensor.data_offsets[1] += 4
      }
    },
    (source: Header) => {
      Object.values(source)[1].data_offsets = [0, 8192]
    },
  ]) {
    const source = header()
    mutate(source)
    assert.throws(() => inspect(source))
  }
  assert.throws(() => inspect(header(), 12_292), /complete payload/)
  assert.throws(() => inspect(header(), 12_284), /offsets/)
})

test('JSON grammar, decoded duplicate fields, malformed metadata and the exact header ceiling refuse', () => {
  const valid = JSON.stringify(header())
  const first = JSON.stringify(Object.values(header())[0])
  for (const text of [
    `{${valid.slice(1, -1)},"${kohya}.lora_down.weight":${first}}`,
    String.raw`{${valid.slice(1, -1)},"\u006cora_unet_blocks_0_cross_attn_k_proj.lora_down.weight":${first}}`,
    valid.replace('"dtype":"F32"', '"dtype":"F16","dtype":"F32"'),
    valid.replace('"shape":[1,1024]', '"shape":[99],"shape":[1,1024]'),
    `{${valid.slice(1, -1)},"__metadata__":{"alpha":"1","alpha":"2"}}`,
  ]) {
    assert.throws(
      () =>
        inspectAnimaLoraSafetensorsHeader(Buffer.from(text), 8 + Buffer.byteLength(text) + 12_288),
      /duplicate/,
    )
  }
  for (const metadata of [null, [], { ss_network_alpha: 32 }]) {
    const bytes = Buffer.from(JSON.stringify({ ...header(), __metadata__: metadata }))
    assert.throws(
      () => inspectAnimaLoraSafetensorsHeader(bytes, 8 + bytes.length + 12_288),
      /metadata/,
    )
  }
  const metadataBytes = Buffer.from(
    JSON.stringify({
      ...header(),
      __metadata__: {
        config: '{"untrusted":true}',
        escaped: 'quote: " slash: \\',
        ss_network_alpha: '32',
      },
    }),
  )
  assert.doesNotThrow(() =>
    inspectAnimaLoraSafetensorsHeader(metadataBytes, 8 + metadataBytes.length + 12_288),
  )
  for (const bytes of [
    Buffer.from('{bad'),
    Buffer.from([123, 255, 125]),
    Buffer.from('[]'),
    Buffer.alloc(32 * 1024 * 1024 + 1, 0x20),
  ]) {
    assert.throws(() => inspectAnimaLoraSafetensorsHeader(bytes, 8 + bytes.length + 12_288))
  }
})

test('real files qualify scalar alpha for all supported dtypes and refuse NaN/Inf while preserving missing/zero/signed alpha', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-lora-alpha-'))
  try {
    const file = path.join(root, 'adapter.safetensors')
    await writeFile(file, animaLoraFixture())
    await assert.doesNotReject(qualifyAnimaLora(file))
    for (const value of [-1, 0, 1, NaN, Infinity, -Infinity]) {
      await writeFile(file, packAnimaLora([...pair(), { key: `${kohya}.alpha`, shape: [], value }]))
      await (Number.isFinite(value)
        ? assert.doesNotReject(qualifyAnimaLora(file))
        : assert.rejects(qualifyAnimaLora(file), /not finite/))
    }
    for (const [dtype, finite, nonfinite] of [
      ['F16', [0, 0x3c_00, 0xbc_00], [0x7c_00, 0x7e_00, 0xfc_00]],
      ['BF16', [0, 0x3f_80, 0xbf_80], [0x7f_80, 0x7f_c0, 0xff_80]],
    ] as const) {
      for (const scalarBits of [...finite, ...nonfinite]) {
        await writeFile(
          file,
          packAnimaLora([...pair(), { dtype, key: `${kohya}.alpha`, scalarBits, shape: [] }]),
        )
        await ((finite as readonly number[]).includes(scalarBits)
          ? assert.doesNotReject(qualifyAnimaLora(file))
          : assert.rejects(qualifyAnimaLora(file), /not finite/))
      }
    }
    await writeFile(file, packAnimaLora(pair()))
    await assert.doesNotReject(qualifyAnimaLora(file))
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('bounded file preflight refuses truncation, symlinks, directories, FIFOs and other extensions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-lora-storage-'))
  try {
    const regular = path.join(root, 'regular.safetensors')
    await writeFile(regular, animaLoraFixture())
    await assert.doesNotReject(qualifyAnimaLora(regular))
    const link = path.join(root, 'link.safetensors')
    await symlink(regular, link)
    await assert.rejects(qualifyAnimaLora(link))
    const directory = path.join(root, 'directory.safetensors')
    await mkdir(directory)
    await assert.rejects(qualifyAnimaLora(directory))
    if (process.platform === 'linux') {
      const fifo = path.join(root, 'fifo.safetensors')
      execFileSync('mkfifo', [fifo])
      await assert.rejects(qualifyAnimaLora(fifo), /regular safetensors/)
    }
    await assert.rejects(qualifyAnimaLora(path.join(root, 'weights.bin')), /safetensors file/)
    for (const length of [1n, 32n * 1024n * 1024n + 1n, 1000n]) {
      const prefix = Buffer.alloc(9)
      prefix.writeBigUInt64LE(length)
      await writeFile(regular, prefix)
      await assert.rejects(qualifyAnimaLora(regular), /truncated|exceeds/)
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('a real file metadata change between the initial stat and reads is refused by the final stat', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-lora-stat-'))
  const file = path.join(root, 'adapter.safetensors')
  let operations = 0
  let changed = false
  try {
    await writeFile(file, animaLoraFixture())
    const before = await stat(file)
    await assert.doesNotReject(qualifyAnimaLora(file))
    // Interleave an actual external metadata edit at the first positional read.
    // The native Node fs promises are used unchanged: open, initial stat, then read.
    const hook = createHook({
      init(_id, type) {
        if (type === 'FSREQPROMISE' && ++operations === 3) {
          utimesSync(file, before.atime, new Date(before.mtimeMs + 1000))
          changed = true
        }
      },
    })
    hook.enable()
    try {
      await assert.rejects(qualifyAnimaLora(file), /changed during/)
    } finally {
      hook.disable()
    }
    assert.equal(changed, true)
    await assert.doesNotReject(qualifyAnimaLora(file))
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
