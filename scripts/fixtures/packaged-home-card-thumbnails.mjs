import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'

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
          'json.dump(sorted(set(image.crop((x, y, x + 3, y + 3)).getdata())), sys.stdout)',
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

/** Check normal image loading before requesting decode or capturing any screenshot. */
export async function measureCardThumbnails(page, grid, files, root, appData, lifetime, controls) {
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

  const sample = async (id, label) => {
    const file = projects.get(id)
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
  const end = await sample(tail, 'last')
  assert.ok(end.observed.scrollTop > before.scrollTop)
  await scroller.evaluate((element) => element.scrollTo(0, 0))
  return { before, end, front }
}
