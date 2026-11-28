import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

const size = 16
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function createCardThumbnails(count) {
  const colors = Array.from({ length: count }, (_, index) =>
    [0, 3, 6].map((shift) => 24 + 28 * ((index >> shift) & 7)),
  )
  const encoded = JSON.parse(
    execFileSync(
      '/usr/bin/python3',
      [
        '-c',
        [
          'import base64, io, json, sys',
          'from PIL import Image',
          'result = []',
          'for color in json.load(sys.stdin):',
          '    with io.BytesIO() as buffer:',
          '        Image.new("RGB", (16, 16), tuple(color)).save(buffer, "WEBP", lossless=True)',
          '        result.append(base64.b64encode(buffer.getvalue()).decode("ascii"))',
          'json.dump(result, sys.stdout)',
        ].join('\n'),
      ],
      { input: JSON.stringify(colors), timeout: 10_000 },
    ),
  )
  assert.equal(encoded.length, count)
  const fixtures = encoded.map((value, index) => {
    const bytes = Buffer.from(value, 'base64')
    return { bytes, rgb: colors[index], sha256: digest(bytes) }
  })
  assert.equal(new Set(fixtures.map((fixture) => fixture.sha256)).size, count)
  return fixtures
}

function cachePath(appData, sha256) {
  assert.match(sha256, /^[a-f0-9]{64}$/)
  return path.join(appData, 'previews', 'project-thumbnails', `${sha256}.webp`)
}

async function readExactCache(filename, sha256) {
  const info = await lstat(filename)
  assert.ok(info.isFile() && info.nlink === 1 && info.size <= 64 * 1024)
  assert.equal(await realpath(filename), filename)
  const bytes = await readFile(filename)
  assert.equal(digest(bytes), sha256)
  return bytes
}

async function fifoIdentity(filename) {
  const info = await lstat(filename, { bigint: true })
  assert.ok(info.isFIFO() && info.nlink === 1n)
  return { dev: String(info.dev), ino: String(info.ino) }
}

/** Mutate only the two exact digest entries already observed in the closed owned profile. */
export async function prepareCardCacheControls(root, appData, front) {
  const [first, second] = front
  assert.ok(first && second && first.id !== second.id && first.sha256 !== second.sha256)
  const fifo = cachePath(appData, first.sha256)
  const wrongWebp = cachePath(appData, second.sha256)
  const firstBytes = await readExactCache(fifo, first.sha256)
  await readExactCache(wrongWebp, second.sha256)
  await rename(fifo, path.join(root, 'before-fifo.webp'))
  await rename(wrongWebp, path.join(root, 'before-wrong-webp.webp'))
  execFileSync('/usr/bin/mkfifo', ['-m', '600', '--', fifo], { timeout: 5_000 })
  await writeFile(wrongWebp, firstBytes, { flag: 'wx', mode: 0o600 })
  await readExactCache(wrongWebp, first.sha256)
  return {
    fifo: { id: first.id, filename: fifo, identity: await fifoIdentity(fifo) },
    wrongWebp: {
      id: second.id,
      filename: wrongWebp,
      corruptedSha256: first.sha256,
      expectedSha256: second.sha256,
    },
  }
}

export async function verifyCardCacheControls(controls) {
  assert.deepEqual(await fifoIdentity(controls.fifo.filename), controls.fifo.identity)
  await readExactCache(controls.wrongWebp.filename, controls.wrongWebp.expectedSha256)
  const directory = path.dirname(controls.fifo.filename)
  assert.ok((await readdir(directory)).every((entry) => /^[a-f0-9]{64}\.webp$/.test(entry)))
}

function screenshotColors(bytes, { viewportWidth, viewportHeight, x, y }) {
  return JSON.parse(
    execFileSync(
      '/usr/bin/python3',
      [
        '-c',
        [
          'import json, sys',
          'from PIL import Image',
          'width, height, x, y = map(int, sys.argv[1:])',
          'image = Image.open(sys.stdin.buffer).convert("RGB")',
          'assert image.size == (width, height), (image.size, width, height)',
          'assert 0 <= x <= width - 3 and 0 <= y <= height - 3, (x, y)',
          'colors = image.crop((x, y, x + 3, y + 3)).getcolors(9)',
          'json.dump(sorted(color for _, color in colors), sys.stdout)',
        ].join('\n'),
        String(viewportWidth),
        String(viewportHeight),
        String(x),
        String(y),
      ],
      { input: bytes, timeout: 5_000 },
    ),
  )
}

export function indexedThumbnail(appData, id) {
  const database = new Database(path.join(appData, 'database/app.sqlite'), {
    fileMustExist: true,
    readonly: true,
  })
  try {
    return database
      .prepare(
        `SELECT canonical_path AS filename, document_id AS documentId, document_revision AS revision,
              file_fingerprint AS fingerprint, file_health AS health,
              preview_thumbnail_sha256 AS thumbnailSha256
       FROM project_index WHERE local_project_key = ?`,
      )
      .get(id)
  } finally {
    database.close()
  }
}

async function archiveIdentity(filename) {
  assert.equal(await realpath(filename), filename)
  const info = await lstat(filename, { bigint: true })
  assert.ok(info.isFile() && info.nlink === 1n && info.uid === BigInt(process.getuid()))
  return {
    fingerprint: `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`,
    inode: String(info.ino),
    size: Number(info.size),
    sha256: digest(await readFile(filename)),
  }
}

async function replaceIndexedArchive(appData, file, replaceWithRevision) {
  const filename = file.bytes.path
  assert.equal(path.dirname(filename), path.join(appData, 'workspaces/Uncategorized'))
  const original = await archiveIdentity(filename)
  assert.equal(original.sha256, file.bytes.sha256)
  assert.equal(original.size, file.bytes.sizeBytes)
  const before = indexedThumbnail(appData, file.id)
  assert.deepEqual(before, {
    documentId: file.documentId,
    filename,
    fingerprint: original.fingerprint,
    health: 'ready',
    revision: file.revision,
    thumbnailSha256: file.cardThumbnail.sha256,
  })
  let revisedFile
  if (replaceWithRevision) {
    revisedFile = await replaceWithRevision(file)
    assert.equal(revisedFile.bytes.path, filename)
    assert.equal(revisedFile.documentId, file.documentId)
    assert.equal(revisedFile.id, file.id)
    assert.equal(revisedFile.title, file.title)
    assert.equal(revisedFile.workspaceId, file.workspaceId)
    assert.notEqual(revisedFile.revision, file.revision)
    assert.notEqual(revisedFile.cardThumbnail.sha256, file.cardThumbnail.sha256)
  } else {
    const pending = path.join(path.dirname(filename), '.thumbnail-refresh-replacement.tmp')
    await copyFile(filename, pending, constants.COPYFILE_EXCL)
    execFileSync('/usr/bin/touch', ['-r', filename, '--', pending], { timeout: 5_000 })
    assert.deepEqual(await archiveIdentity(filename), original)
    await rename(pending, filename)
  }
  const replacement = await archiveIdentity(filename)
  if (revisedFile) {
    assert.equal(replacement.sha256, revisedFile.bytes.sha256)
    assert.equal(replacement.size, revisedFile.bytes.sizeBytes)
    assert.notEqual(replacement.sha256, original.sha256)
  } else {
    assert.equal(replacement.sha256, original.sha256)
    assert.equal(replacement.size, original.size)
  }
  assert.notEqual(replacement.inode, original.inode)
  assert.deepEqual(indexedThumbnail(appData, file.id), before)
  return { before, original, replacement, ...(revisedFile && { revisedFile }) }
}

async function probeOldThumbnail(page, oldSource) {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Network.enable')
    await session.send('Network.setCacheDisabled', { cacheDisabled: true })
    const [response, event] = await Promise.all([
      page.waitForResponse((reply) => reply.url() === oldSource, { timeout: 10_000 }),
      page.evaluate(
        (url) =>
          new Promise((resolve) => {
            const probe = new Image()
            const deadline = setTimeout(() => resolve('timeout'), 7_000)
            probe.onload = () => {
              clearTimeout(deadline)
              resolve('load')
            }
            probe.onerror = () => {
              clearTimeout(deadline)
              resolve('error')
            }
            probe.src = url
          }),
        oldSource,
      ),
    ])
    assert.equal(response.status(), 404)
    assert.equal(event, 'error')
    return { event, status: response.status(), url: response.url() }
  } finally {
    await session.send('Network.setCacheDisabled', { cacheDisabled: false })
    await session.detach()
  }
}

async function refreshStaleThumbnail({
  appData,
  card,
  file,
  image,
  lifetime,
  page,
  readView,
  refreshCatalog,
  replaceWithRevision,
  root,
  sample,
  scrollEnd,
}) {
  const before = await readView()
  assert.equal(before.complete, false)
  assert.equal(before.width, 0)
  const cache = cachePath(appData, file.cardThumbnail.sha256)
  await assert.rejects(lstat(cache), { code: 'ENOENT' })
  await image.evaluate((element) => {
    element.addEventListener(
      'error',
      () => {
        globalThis.__igsThumbnailFailure = element.currentSrc || element.src
      },
      { once: true },
    )
  })
  const responses = []
  const observeResponse = (response) => {
    if (response.url().startsWith(`igs-preview://thumbnail/${file.id}/`)) {
      responses.push({ status: response.status(), url: response.url() })
    }
  }
  page.on('response', observeResponse)
  try {
    const changed = await replaceIndexedArchive(appData, file, replaceWithRevision)
    const expected = changed.revisedFile ?? file
    await scrollEnd()
    await expect(image).toHaveCount(0)
    assert.equal(await page.evaluate(() => globalThis.__igsThumbnailFailure), before.source)
    const placeholder = card.locator('.project-thumbnail svg')
    await expect(placeholder).toBeVisible()
    await expect(placeholder).toBeInViewport()
    await assert.rejects(lstat(cache), { code: 'ENOENT' })
    assert.deepEqual(indexedThumbnail(appData, file.id), changed.before)
    const fallback = path.join(root, `${lifetime}-thumbnail-stale-fallback.png`)
    const fallbackBytes = await page.screenshot({ path: fallback, scale: 'css' })
    const refresh = await refreshCatalog()
    const after = indexedThumbnail(appData, file.id)
    assert.deepEqual(after, {
      ...changed.before,
      fingerprint: changed.replacement.fingerprint,
      revision: expected.revision,
      thumbnailSha256: expected.cardThumbnail.sha256,
    })
    await scrollEnd()
    const end = await sample(expected)
    assert.deepEqual(await archiveIdentity(file.bytes.path), changed.replacement)
    assert.deepEqual(responses, [
      { status: 404, url: before.source },
      { status: 200, url: end.observed.source },
    ])
    let oldAfterRefresh
    if (changed.revisedFile) {
      assert.notEqual(end.observed.source, before.source)
      oldAfterRefresh = await probeOldThumbnail(page, before.source)
      await assert.rejects(lstat(cache), { code: 'ENOENT' })
    } else {
      assert.equal(end.observed.source, before.source)
    }
    return {
      end,
      observation: {
        ...changed,
        after,
        fallback,
        fallbackSha256: digest(fallbackBytes),
        refresh,
        responses: responses.map(({ status }) => status),
        ...(oldAfterRefresh && { requests: responses, oldAfterRefresh }),
      },
    }
  } finally {
    page.off('response', observeResponse)
  }
}

/** Check normal image loading before requesting decode or capturing any screenshot. */
export async function measureCardThumbnails(
  page,
  grid,
  files,
  root,
  appData,
  lifetime,
  controls,
  refreshCatalog,
  replaceWithRevision,
) {
  const scroller = page.locator('.browser-content')
  const order = await grid
    .locator('[data-project-id]')
    .evaluateAll((rows) => rows.map((row) => row.dataset.projectId))
  assert.equal(order.length, files.length)
  const projects = new Map(files.map((file) => [file.id, file]))
  const article = (id) => grid.locator(`[data-project-id="${id}"]`)
  const img = (id) => article(id).locator('.project-thumbnail img')
  const view = (id) =>
    img(id).evaluate((element) => {
      const scroll = element.closest('.browser-content')
      const clip = scroll.getBoundingClientRect()
      const rect = element.getBoundingClientRect()
      const x = Math.floor(rect.x + rect.width / 2) - 1
      const y = Math.floor(rect.y + rect.height / 2) - 1
      return {
        clip: { bottom: clip.bottom, left: clip.left, right: clip.right, top: clip.top },
        clipBottom: clip.bottom,
        complete: element.complete,
        declaredLoading: element.loading,
        height: element.naturalHeight,
        intersects: rect.top < clip.bottom && rect.bottom > clip.top,
        paintPointVisible:
          rect.width >= 3 &&
          rect.height >= 3 &&
          x >= Math.max(clip.left, 0) &&
          y >= Math.max(clip.top, 0) &&
          x + 3 <= Math.min(clip.right, innerWidth) &&
          y + 3 <= Math.min(clip.bottom, innerHeight),
        scrollTop: scroll.scrollTop,
        source: element.currentSrc || element.src,
        top: rect.top,
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
        width: element.naturalWidth,
        x,
        y,
      }
    })
  const tail = order.at(-1)
  const before = await view(tail)
  assert.equal(before.declaredLoading, 'lazy')
  assert.equal(before.complete, false)
  assert.equal(before.width, 0)
  assert.ok(!before.intersects && before.top > before.clipBottom && before.scrollTop === 0)
  if (!controls) {
    await assert.rejects(lstat(cachePath(appData, projects.get(tail).cardThumbnail.sha256)), {
      code: 'ENOENT',
    })
  }

  const sample = async (id, label, file = projects.get(id)) => {
    const { rgb, sha256 } = file.cardThumbnail
    await expect(
      article(id).getByRole('button', { name: `Select ${file.title}`, exact: true }),
    ).toBeVisible()
    try {
      await expect
        .poll(async () => {
          const observation = await view(id)
          return observation.complete && observation.paintPointVisible && observation.width === size
        })
        .toBe(true)
    } catch (error) {
      await writeFile(
        path.join(root, `${lifetime}-thumbnail-${label}-failure.json`),
        JSON.stringify({ id, observation: await view(id) }, null, 2) + '\n',
        { flag: 'wx', mode: 0o600 },
      )
      await page.screenshot({ path: path.join(root, `${lifetime}-thumbnail-failure.png`) })
      throw error
    }
    await img(id).evaluate((element) => element.decode())
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    const observed = await view(id)
    assert.equal(observed.paintPointVisible, true)
    assert.equal(observed.height, size)
    assert.equal(observed.declaredLoading, 'lazy')
    assert.ok(observed.source.startsWith(`igs-preview://thumbnail/${id}/${sha256}/`))
    if (id !== controls?.fifo.id) await readExactCache(cachePath(appData, sha256), sha256)
    const screenshot = path.join(root, `${lifetime}-thumbnail-${label}.png`)
    const captured = await page.screenshot({ path: screenshot, scale: 'css' })
    const measured = screenshotColors(captured, observed)
    assert.deepEqual(measured, [rgb], `Unexpected painted WebP on ${file.title}`)
    return {
      id,
      observed,
      rgb,
      screenshot,
      screenshotSha256: digest(captured),
      sha256,
      title: file.title,
    }
  }

  const front = []
  for (const [index, id] of order.slice(0, 2).entries()) {
    front.push(await sample(id, `front-${index + 1}`))
  }
  if (controls) {
    assert.deepEqual(
      front.map(({ id }) => id),
      [controls.fifo.id, controls.wrongWebp.id],
    )
  }
  const scrollEnd = async () => {
    const bounds = await scroller.boundingBox()
    assert.ok(bounds)
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.wheel(0, await scroller.evaluate((element) => element.scrollHeight))
    await expect
      .poll(
        async () =>
          await scroller.evaluate(
            (element) =>
              Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <= 1,
          ),
      )
      .toBe(true)
  }
  const runTail = async () => {
    await scrollEnd()
    return { end: await sample(tail, 'last') }
  }
  const { end, observation } = refreshCatalog
    ? await refreshStaleThumbnail({
        appData,
        card: article(tail),
        file: projects.get(tail),
        image: img(tail),
        lifetime,
        page,
        readView: () => view(tail),
        refreshCatalog,
        replaceWithRevision,
        root,
        sample: (file) => sample(tail, 'last', file),
        scrollEnd,
      })
    : await runTail()
  assert.ok(end.observed.scrollTop > before.scrollTop)
  await scroller.evaluate((element) => element.scrollTo(0, 0))
  return { before, end, front, ...(observation && { externalReplacement: observation }) }
}
