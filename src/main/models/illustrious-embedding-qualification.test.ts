import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  inspectIllustriousEmbeddingSafetensorsHeader,
  qualifyIllustriousEmbedding,
} from './illustrious-embedding-qualification.js'
import {
  type EmbeddingHeaderFixture,
  illustriousEmbeddingFixture,
} from './test-fixtures/illustrious-embedding.js'

function inspect(bytes: Buffer): void {
  const length = Number(bytes.readBigUInt64LE(0))
  inspectIllustriousEmbeddingSafetensorsHeader(bytes.subarray(8, 8 + length), bytes.length)
}
function tensor(header: EmbeddingHeaderFixture, key: string) {
  return header[key] as { data_offsets: number[]; dtype: string; shape: number[] }
}

// Boundary: production nofollow header reader. Synthetic finite bytes prove structure, not ML quality.
for (const dtype of ['F16', 'BF16', 'F32'] as const) {
  for (const vectors of [1, 3, 300]) {
    test(`embedding qualifier accepts current paired ${dtype} file with ${vectors} vectors`, async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'igs-embedding-header-'))
      try {
        const file = path.join(root, 'embedding.safetensors')
        await writeFile(file, illustriousEmbeddingFixture(0.125, { dtype, vectors }))
        await assert.doesNotReject(qualifyIllustriousEmbedding(file))
      } finally {
        await rm(root, { force: true, recursive: true })
      }
    })
  }
}
test('embedding qualifier accepts paired one-dimensional singleton and equivalent mixed ranks', () => {
  inspect(illustriousEmbeddingFixture(0.125, { singleton: true }))
  inspect(
    illustriousEmbeddingFixture(0.125, {
      editHeader: (header) => {
        tensor(header, 'clip_l').shape = [768]
      },
    }),
  )
})
test('embedding qualifier refuses a structurally consistent 301-vector file above the conditioning budget', () => {
  assert.throws(() => inspect(illustriousEmbeddingFixture(0.125, { vectors: 301 })), {
    name: 'IllustriousEmbeddingQualificationError',
  })
})
test('embedding qualifier refuses a leading payload gap even when all tensor byte lengths and final coverage match', () => {
  const bytes = illustriousEmbeddingFixture(0.125, {
    editHeader: (header) => {
      for (const key of ['clip_l', 'clip_g']) {
        tensor(header, key).data_offsets = tensor(header, key).data_offsets.map(
          (offset) => offset + 1,
        )
      }
    },
  })
  assert.throws(() => inspect(Buffer.concat([bytes, Buffer.from([0])])), {
    name: 'IllustriousEmbeddingQualificationError',
  })
})

for (const [name, editHeader] of [
  [
    'single encoder',
    (h: EmbeddingHeaderFixture) => {
      delete h.clip_g
    },
  ],
  [
    'foreign SD1 tensor',
    (h: EmbeddingHeaderFixture) => {
      h.emb_params = h.clip_l
      delete h.clip_l
    },
  ],
  [
    'extra tensor',
    (h: EmbeddingHeaderFixture) => {
      h.extra = h.clip_l
    },
  ],
  [
    'wrong CLIP width',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_l').shape = [1, 1280]
    },
  ],
  [
    'unequal vector counts',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_l').shape = [2, 768]
    },
  ],
  [
    'zero vectors',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_l').shape = [0, 768]
    },
  ],
  [
    'over-budget vectors',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_l').shape = [301, 768]
      tensor(h, 'clip_g').shape = [301, 1280]
    },
  ],
  [
    'unsafe dimensions',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_l').shape = [Number.MAX_SAFE_INTEGER + 1, 768]
    },
  ],
  [
    'three dimensions',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_l').shape = [1, 1, 768]
    },
  ],
  [
    'integer dtype',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_l').dtype = 'I32'
    },
  ],
  [
    'unknown dtype',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_l').dtype = 'F64'
    },
  ],
  [
    'invalid offsets',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_l').data_offsets = [-1, 3071]
    },
  ],
  [
    'overlapping payload',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_g').data_offsets = [0, 5120]
    },
  ],
  [
    'payload gap',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_g').data_offsets = [3073, 8193]
    },
  ],
  [
    'tensor byte mismatch',
    (h: EmbeddingHeaderFixture) => {
      tensor(h, 'clip_l').data_offsets = [0, 3071]
    },
  ],
  [
    'non-string metadata',
    (h: EmbeddingHeaderFixture) => {
      h.__metadata__ = { version: 1 }
    },
  ],
] as const) {
  test(`embedding qualifier refuses ${name}`, () => {
    assert.throws(() => inspect(illustriousEmbeddingFixture(0.125, { editHeader })), {
      name: 'IllustriousEmbeddingQualificationError',
    })
  })
}
test('embedding qualifier refuses trailing/uncovered payload and malformed UTF-8 JSON', () => {
  const bytes = illustriousEmbeddingFixture()
  assert.throws(() => inspect(Buffer.concat([bytes, Buffer.from([0])])), {
    name: 'IllustriousEmbeddingQualificationError',
  })
  for (const header of [Buffer.from('{bad}'), Buffer.from([123, 255, 125]), Buffer.from('[]')]) {
    assert.throws(
      () => inspectIllustriousEmbeddingSafetensorsHeader(header, 8 + header.length + 16),
      { name: 'IllustriousEmbeddingQualificationError' },
    )
  }
})
test('embedding qualifier refuses links, pickle names, huge/truncated headers and directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-embedding-file-'))
  try {
    const valid = path.join(root, 'valid.safetensors')
    await writeFile(valid, illustriousEmbeddingFixture())
    const link = path.join(root, 'link.safetensors')
    await symlink(valid, link)
    await assert.rejects(qualifyIllustriousEmbedding(link))
    await assert.rejects(qualifyIllustriousEmbedding(path.join(root, 'embedding.pt')))
    await assert.rejects(qualifyIllustriousEmbedding(root))
    for (const length of [1n, 33n * 1024n * 1024n, 500n]) {
      const bad = Buffer.alloc(9)
      bad.writeBigUInt64LE(length)
      const file = path.join(root, `bad-${length}.safetensors`)
      await writeFile(file, bad)
      await assert.rejects(qualifyIllustriousEmbedding(file), {
        name: 'IllustriousEmbeddingQualificationError',
      })
    }
    const short = path.join(root, 'short.safetensors')
    await writeFile(short, Buffer.alloc(3))
    await assert.rejects(qualifyIllustriousEmbedding(short), {
      name: 'IllustriousEmbeddingQualificationError',
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
