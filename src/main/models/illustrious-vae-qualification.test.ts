import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import {
  inspectIllustriousVaeSafetensorsHeader,
  qualifyIllustriousVae,
} from './illustrious-vae-qualification.js'
import { illustriousVaeFixture, type VaeHeaderFixture } from './test-fixtures/illustrious-vae.js'

function inspect(bytes: Buffer): void {
  const length = Number(bytes.readBigUInt64LE(0))
  inspectIllustriousVaeSafetensorsHeader(bytes.subarray(8, 8 + length), bytes.length)
}

function tensor(header: VaeHeaderFixture, key: string) {
  return header[key] as { data_offsets: number[]; dtype: string; shape: number[] }
}

// Production boundary: the actual header reader/validator; physical weights are not ML-loaded.
// Neighbor: change one tensor/header property. Removing any guard below must make its rejection red.
for (const layout of ['ldm', 'diffusers'] as const) {
  test(`${layout} standalone VAE anchor file passes actual filesystem preflight`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'igs-vae-header-'))
    try {
      const file = path.join(root, 'vae.safetensors')
      await writeFile(file, illustriousVaeFixture(layout))
      await assert.doesNotReject(qualifyIllustriousVae(file))
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
}

test('full VAE header extracted from pinned official checkpoint passes as a standalone LDM layout', () => {
  const original = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL('./test-fixtures/illustrious-v01-safetensors-header.gz', import.meta.url),
      ),
    )
      .subarray(8)
      .toString('utf8'),
  ) as VaeHeaderFixture
  const header: VaeHeaderFixture = {}
  let offset = 0
  for (const key of Object.keys(original)) {
    if (!key.startsWith('first_stage_model.')) {
      continue
    }
    const descriptor = tensor(original, key)
    const length = descriptor.data_offsets[1] - descriptor.data_offsets[0]
    header[key.slice('first_stage_model.'.length)] = {
      data_offsets: [offset, offset + length],
      dtype: descriptor.dtype,
      shape: [...descriptor.shape],
    }
    offset += length
  }
  assert.equal(Object.keys(header).length, 248)
  const bytes = Buffer.from(JSON.stringify(header))
  assert.doesNotThrow(() =>
    inspectIllustriousVaeSafetensorsHeader(bytes, 8 + bytes.length + offset),
  )
})

for (const [name, edit] of [
  [
    'missing quantizer',
    (header: VaeHeaderFixture) => {
      delete header['quant_conv.weight']
    },
  ],
  [
    'wrong latent channels',
    (header: VaeHeaderFixture) => {
      tensor(header, 'post_quant_conv.weight').shape = [8, 2, 1, 1]
    },
  ],
  [
    'wrong encoder output',
    (header: VaeHeaderFixture) => {
      tensor(header, 'encoder.conv_out.weight').shape = [4, 1024, 3, 3]
    },
  ],
  [
    'mixed native/LDM layout',
    (header: VaeHeaderFixture) => {
      header['encoder.down_blocks.0.resnets.0.conv1.weight'] =
        header['encoder.down.0.block.0.conv1.weight']!
    },
  ],
  [
    'checkpoint prefix',
    (header: VaeHeaderFixture) => {
      header['first_stage_model.encoder.conv_in.weight'] = header['encoder.conv_in.weight']!
      delete header['encoder.conv_in.weight']
    },
  ],
  [
    'integer tensor',
    (header: VaeHeaderFixture) => {
      tensor(header, 'quant_conv.weight').dtype = 'I16'
    },
  ],
  [
    'malformed metadata',
    (header: VaeHeaderFixture) => {
      header.__metadata__ = { wrong: 1 } as unknown as Record<string, string>
    },
  ],
  [
    'overlapping tensor ranges',
    (header: VaeHeaderFixture) => {
      const start = tensor(header, 'quant_conv.weight').data_offsets[0]
      tensor(header, 'post_quant_conv.weight').data_offsets = [start, start + 32]
    },
  ],
  [
    'out-of-bounds range',
    (header: VaeHeaderFixture) => {
      tensor(header, 'quant_conv.weight').data_offsets = [
        Number.MAX_SAFE_INTEGER - 128,
        Number.MAX_SAFE_INTEGER,
      ]
    },
  ],
  [
    'unsafe tensor dimensions',
    (header: VaeHeaderFixture) => {
      tensor(header, 'quant_conv.weight').shape = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
    },
  ],
] as const) {
  test(`standalone VAE header rejects ${name} beside the unchanged accepted file`, () => {
    assert.doesNotThrow(() => inspect(illustriousVaeFixture()))
    assert.throws(() => inspect(illustriousVaeFixture('ldm', edit)), {
      name: 'IllustriousVaeQualificationError',
    })
  })
}

test('actual VAE header reader refuses symlink, pickle extension and truncated/oversized header', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-vae-file-'))
  try {
    const file = path.join(root, 'vae.safetensors')
    const link = path.join(root, 'linked.safetensors')
    await writeFile(file, illustriousVaeFixture())
    await symlink(file, link)
    await assert.rejects(qualifyIllustriousVae(link), { code: 'ELOOP' })
    await assert.rejects(qualifyIllustriousVae(`${file}.pt`), /not a safetensors/)
    const malformed = Buffer.alloc(16)
    malformed.writeBigUInt64LE(33_554_433n)
    await writeFile(file, malformed)
    await assert.rejects(qualifyIllustriousVae(file), /header length/)
    await writeFile(file, Buffer.alloc(4))
    await assert.rejects(qualifyIllustriousVae(file), /regular safetensors/)
    await writeFile(file, illustriousVaeFixture())
    await assert.doesNotReject(qualifyIllustriousVae(file))
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('VAE preflight rejects invalid UTF-8, non-object and a header beyond the allocation ceiling', () => {
  for (const header of [Buffer.from([123, 255, 125]), Buffer.from('[]'), Buffer.from('{invalid')]) {
    assert.throws(() => inspectIllustriousVaeSafetensorsHeader(header, 1e6))
  }
  const file = illustriousVaeFixture()
  const length = Number(file.readBigUInt64LE(0))
  const validHeader = file.subarray(8, 8 + length)
  const oversized = Buffer.concat([validHeader, Buffer.alloc(33_554_433 - length, 0x20)])
  assert.throws(() =>
    inspectIllustriousVaeSafetensorsHeader(oversized, file.length + oversized.length - length),
  )
})

test('VAE layout guard rejects otherwise valid extra native tensors inside a complete LDM file', () => {
  const file = illustriousVaeFixture()
  const length = Number(file.readBigUInt64LE(0))
  const header = JSON.parse(file.subarray(8, 8 + length).toString('utf8')) as VaeHeaderFixture
  const payloadSize = file.length - 8 - length
  header['encoder.down_blocks.0.resnets.0.conv1.weight'] = {
    data_offsets: [payloadSize, payloadSize + 128 * 128 * 3 * 3 * 2],
    dtype: 'F16',
    shape: [128, 128, 3, 3],
  }
  const bytes = Buffer.from(JSON.stringify(header))
  assert.throws(
    () =>
      inspectIllustriousVaeSafetensorsHeader(
        bytes,
        8 + bytes.length + payloadSize + 128 * 128 * 3 * 3 * 2,
      ),
    /one supported standalone LDM or native Diffusers layout/,
  )
})
