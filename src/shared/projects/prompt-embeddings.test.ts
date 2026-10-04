import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ModelCatalogItem } from '../api.js'

import {
  activePromptEmbeddingRefs,
  embeddingActivationToken,
  embeddingSourcesFromCatalog,
  getPromptEmbeddingMatches,
  promptEmbeddingLiteralRanges,
  type PromptEmbeddingSource,
  reconcilePromptEmbeddings,
  selectablePromptEmbeddingSources,
} from './prompt-embeddings.js'

const source = (
  id: string,
  token = '<detail>',
  fileStatus: PromptEmbeddingSource['fileStatus'] = 'ready',
): PromptEmbeddingSource => ({
  fileStatus,
  resource: {
    baseModelFamily: 'illustrious',
    civitaiFileId: 3,
    civitaiModelId: 1,
    civitaiVersionId: 2,
    displayName: 'Details',
    fileSha256: 'a'.repeat(64),
    kind: 'embedding',
    localModelId: id,
    localVersionId: `${id}-v1`,
    predictionType: null,
    versionName: 'v1',
  },
  searchTerms: ['Details'],
  token,
})

test('activation literals derive from exact filename and never display names or polarity guesses', () => {
  assert.equal(embeddingActivationToken('Detail_v2.safetensors'), '<Detail_v2>')
  assert.equal(embeddingActivationToken('Мягкий свет.SAFETENSORS'), '<Мягкий свет>')
  for (const name of [
    '.safetensors',
    '  .safetensors',
    '../a.safetensors',
    String.raw`a\b.safetensors`,
    'a<bad>.safetensors',
    'a\n.safetensors',
    'a.pt',
  ]) {
    assert.equal(embeddingActivationToken(name), null, name)
  }
  const catalog: ModelCatalogItem[] = [
    {
      author: null,
      defaultVersionId: 'v2',
      description: null,
      id: 'model',
      modelId: 4,
      name: 'Mutable source name',
      previewDataUrl: null,
      resourceType: 'embedding',
      sourceUrl: null,
      trainedWords: ['not-an-alias'],
      versions: [
        {
          baseModelFamily: 'illustrious',
          civitaiFileId: 6,
          civitaiVersionId: 5,
          dependencyIssues: [],
          fileName: 'exact.safetensors',
          fileSizeBytes: 12,
          fileStatus: 'ready',
          format: 'SafeTensor',
          id: 'v1',
          installedAt: '2026-10-04',
          name: 'Version one',
          predictionType: null,
          sha256: 'a'.repeat(64),
          trainedWords: ['search me'],
        },
      ],
    },
  ]
  const projected = embeddingSourcesFromCatalog(catalog)
  assert.equal(projected[0].token, '<exact>')
  assert.equal(projected[0].resource.localVersionId, 'v1')
  assert.deepEqual(projected[0].searchTerms, ['Mutable source name', 'Version one', 'search me'])
  catalog[0].name = 'Renamed'
  assert.equal(embeddingSourcesFromCatalog(catalog)[0].token, '<exact>')
})

test('literal matching preserves case and permits punctuation tokens with word-side boundaries', () => {
  assert.deepEqual(promptEmbeddingLiteralRanges('detail, detailed, DETAIL, (detail)+', 'detail'), [
    { from: 0, to: 6 },
    { from: 27, to: 33 },
  ])
  assert.deepEqual(promptEmbeddingLiteralRanges('x<detail>y, <Detail>, <detail>', '<detail>'), [
    { from: 1, to: 9 },
    { from: 22, to: 30 },
  ])
  assert.deepEqual(promptEmbeddingLiteralRanges('anything', ''), [])
})

test('trusted reconciliation auto-links uniquely, orders/deduplicates refs and prunes only vanished literals', () => {
  const first = source('one')
  const second = source('two', '<second>')
  const result = reconcilePromptEmbeddings(
    { embeddingRefs: [], text: '<second>, <detail>, <detail>' },
    [first, second],
  )
  assert.deepEqual(
    result.embeddingRefs.map((ref) => ref.token),
    ['<second>', '<detail>'],
  )
  assert.equal(result.embeddingRefs.length, 2)
  const pruned = reconcilePromptEmbeddings({ ...result, text: '<detail>' }, [])
  assert.deepEqual(pruned.embeddingRefs, [{ resource: first.resource, token: first.token }])
  assert.deepEqual(
    reconcilePromptEmbeddings({ ...result, text: '<DETAIL>' }, [first]).embeddingRefs,
    [],
  )
  assert.deepEqual(
    reconcilePromptEmbeddings({ embeddingRefs: [], text: '<detail>' }, [first, first])
      .embeddingRefs,
    [{ resource: first.resource, token: first.token }],
  )
})

test('colliding canonical tokens remain unbound; explicit selection wins without mutable Default substitution', () => {
  const a = source('one')
  const b = source('two')
  const unbound = { embeddingRefs: [], text: '<detail>, portrait' }
  assert.deepEqual(reconcilePromptEmbeddings(unbound, [a, b]).embeddingRefs, [])
  assert.equal(getPromptEmbeddingMatches(unbound, [a, b])[0].status, 'ambiguous')
  const selected = reconcilePromptEmbeddings(unbound, [a, b], {
    resource: b.resource,
    token: b.token,
  })
  assert.deepEqual(selected.embeddingRefs, [{ resource: b.resource, token: b.token }])
  assert.deepEqual(reconcilePromptEmbeddings(selected, [b, a]), selected)
  assert.equal(getPromptEmbeddingMatches(selected, [a, b])[0].ref?.resource.localModelId, 'two')
  assert.equal(getPromptEmbeddingMatches(selected, [a, b])[0].status, 'ready')
})

test('stored identity and custom literal survive missing/renamed files; same exact completion preserves copied metadata', () => {
  const a = source('one')
  const prompt = {
    embeddingRefs: [{ resource: a.resource, token: 'legacy_token' }],
    text: 'legacy_token, portrait',
  }
  const renamed = structuredClone(a)
  renamed.resource.displayName = 'New name'
  renamed.resource.versionName = 'New version name'
  assert.deepEqual(reconcilePromptEmbeddings(prompt, [renamed]), prompt)
  assert.equal(getPromptEmbeddingMatches(prompt, [renamed])[0].status, 'ready')
  assert.equal(getPromptEmbeddingMatches(prompt, [])[0].status, 'missing')
  assert.deepEqual(reconcilePromptEmbeddings(prompt, []), prompt)
  const canonical = { embeddingRefs: [{ resource: a.resource, token: a.token }], text: a.token }
  assert.deepEqual(
    reconcilePromptEmbeddings(canonical, [renamed], {
      resource: renamed.resource,
      token: renamed.token,
    }),
    canonical,
  )
  renamed.resource.displayName = 'After mutation'
  assert.equal(canonical.embeddingRefs[0].resource.displayName, 'Details')
})

test('diagnostics distinguish exact file corruption, portable relink, unknown catalog and unsupported family', () => {
  const a = source('one')
  const prompt = { embeddingRefs: [{ resource: a.resource, token: a.token }], text: a.token }
  assert.equal(
    getPromptEmbeddingMatches(prompt, [source('one', a.token, 'corrupt')])[0].status,
    'corrupt',
  )
  assert.equal(
    getPromptEmbeddingMatches(prompt, [source('one', a.token, 'missing')])[0].status,
    'missing',
  )
  assert.equal(getPromptEmbeddingMatches(prompt, [], false)[0].status, 'checking')
  assert.equal(getPromptEmbeddingMatches(prompt, [a], true, 'anima')[0].status, 'unsupported')
  const portable = source('another-installation')
  assert.equal(getPromptEmbeddingMatches(prompt, [portable])[0].status, 'unlinked')
  portable.resource.fileSha256 = 'b'.repeat(64)
  assert.equal(getPromptEmbeddingMatches(prompt, [portable])[0].status, 'missing')
  assert.equal(
    getPromptEmbeddingMatches({ embeddingRefs: [], text: a.token }, [a])[0].status,
    'unbound',
  )
  assert.deepEqual(
    selectablePromptEmbeddingSources([a, source('bad', '<bad>', 'corrupt')], 'illustrious'),
    [a],
  )
  assert.deepEqual(selectablePromptEmbeddingSources([a], 'anima'), [])
  assert.equal(
    getPromptEmbeddingMatches({ embeddingRefs: [], text: a.token }, [a], true, 'anima')[0].status,
    'unsupported',
  )
  const foreign = structuredClone(a)
  foreign.resource.baseModelFamily = 'anima'
  assert.equal(
    getPromptEmbeddingMatches(
      { embeddingRefs: [], text: a.token },
      [foreign],
      true,
      'illustrious',
    )[0].status,
    'unsupported',
  )
})

test('overlapping literal diagnostics use longest ranges instead of duplicate competing decorations', () => {
  const long = source('long', '<detail>')
  const inner = source('inner', 'detail')
  const matches = getPromptEmbeddingMatches({ embeddingRefs: [], text: '<detail>' }, [inner, long])
  assert.deepEqual(
    matches.map(({ from, to, token }) => ({ from, to, token })),
    [{ from: 0, to: 8, token: '<detail>' }],
  )
  const recalled = {
    embeddingRefs: [{ resource: inner.resource, token: 'abc<' }],
    text: 'abc<defg>',
  }
  const canonical = source('canonical', '<defg>')
  canonical.resource.civitaiModelId = 20
  canonical.resource.civitaiVersionId = 21
  canonical.resource.civitaiFileId = 22
  assert.deepEqual(
    getPromptEmbeddingMatches(recalled, [canonical]).map((match) => match.token),
    ['<defg>'],
  )
  assert.deepEqual(
    getPromptEmbeddingMatches(recalled, [canonical], true, 'illustrious', true).map((match) => [
      match.token,
      match.status,
    ]),
    [
      ['abc<', 'missing'],
      ['<defg>', 'unbound'],
    ],
  )
})

test('active inference and visible matching agree on UTF-16 longest-first ties for crossing saved Unicode literals', () => {
  const unicode = { resource: source('unicode').resource, token: '😀:' }
  const latin = { resource: source('latin').resource, token: ':ab' }
  const text = '😀:ab 😀: :ab'
  const refs = [latin, unicode]
  assert.deepEqual(activePromptEmbeddingRefs(text, refs), [unicode, latin])
  const visible = getPromptEmbeddingMatches({ embeddingRefs: refs, text }, [])
  assert.deepEqual(
    visible.map(({ from, to, token }) => ({ from, to, token })),
    [
      { from: 0, to: 3, token: '😀:' },
      { from: 6, to: 9, token: '😀:' },
      { from: 10, to: 13, token: ':ab' },
    ],
  )
  assert.equal(text.slice(visible[0].from, visible[0].to), '😀:')
})
