/** Read-only evidence for the stock AppImage runtime's owned Type 2 mount. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { lstat, open, readFile, readlink, realpath, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

function inside(directory, filename) {
  const relative = path.relative(directory, filename)
  return Boolean(
    relative &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative),
  )
}

function inode(entry) {
  return { device: String(entry.dev), inode: String(entry.ino) }
}

async function currentProcess(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 1)
  const proc = `/proc/${pid}`
  const text = await readFile(`${proc}/stat`, 'utf8')
  assert.ok(text.startsWith(`${pid} (`))
  const fields = text
    .slice(text.lastIndexOf(') ') + 2)
    .trim()
    .split(/\s+/)
  const { uid } = await lstat(proc)
  const start = fields[19]
  assert.match(start, /^[0-9]+$/)
  assert.match(fields[1], /^[0-9]+$/)
  assert.equal(uid, process.getuid(), 'Only observe an owned launcher process.')
  assert.ok(!['Z', 'X', 'x'].includes(fields[0]), 'The captured process must still be live.')
  return { pid, start, parent: Number(fields[1]) }
}

function decodeMount(value) {
  return value.replace(/\\([0-7]{3})/g, (_match, octal) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  )
}

async function exactMount(proc, mountpoint) {
  const lines = (await readFile(`${proc}/mountinfo`, 'utf8')).trimEnd().split('\n')
  const matches = lines.filter((line) => decodeMount(line.split(' ')[4]) === mountpoint)
  assert.ok(matches.length <= 1, 'The owned AppDir must not have stacked mounts.')
  if (matches.length === 0) return null
  const [fields, filesystem] = matches[0].split(' - ')
  const [id, parentId, device, root, , options] = fields.split(' ')
  const [type, source, superOptions] = filesystem.split(' ')
  return {
    id,
    parentId,
    device,
    root: decodeMount(root),
    mountpoint,
    options,
    type,
    source: decodeMount(source),
    superOptions,
    line: matches[0],
  }
}

async function type2Image(filename) {
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const file = await handle.stat({ bigint: true })
    assert.ok(file.isFile() && file.nlink === 1n && file.uid === BigInt(process.getuid()))
    assert.ok((file.mode & 0o111n) !== 0n)
    const header = Buffer.alloc(11)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    assert.equal(bytesRead, header.length)
    assert.deepEqual(header.subarray(0, 4), Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
    assert.deepEqual(header.subarray(8, 11), Buffer.from([0x41, 0x49, 2]))
    assert.deepEqual(inode(await lstat(filename, { bigint: true })), inode(file))
    return { path: filename, ...inode(file), sizeBytes: Number(file.size) }
  } finally {
    await handle.close()
  }
}

async function launcherWitness(wrapperPid, image) {
  const proc = `/proc/${wrapperPid}`
  const executable = await readlink(`${proc}/exe`)
  if (executable === image.path) {
    assert.deepEqual(inode(await stat(`${proc}/exe`, { bigint: true })), {
      device: image.device,
      inode: image.inode,
    })
    return { executable, imageArgument: image.path, method: 'native' }
  }

  // AppImageLauncher can leave the kernel binfmt interceptor as the parent even
  // when its desktop integration is disabled. Bind the actual kernel rule and argv.
  const rule = (await readFile('/proc/sys/fs/binfmt_misc/appimage-type2', 'utf8'))
    .trimEnd()
    .split('\n')
  const interpreter = rule[1]?.match(/^interpreter (\/[^\n]+)$/)?.[1]
  assert.ok(
    interpreter &&
      rule.includes('enabled') &&
      rule.includes('offset 8') &&
      rule.includes('magic 414902'),
  )
  assert.ok(rule.includes('flags: F'))
  assert.equal(await realpath(interpreter), executable)
  assert.deepEqual(
    inode(await stat(`${proc}/exe`, { bigint: true })),
    inode(await stat(interpreter, { bigint: true })),
  )
  const [invokedInterpreter, imageArgument] = (await readFile(`${proc}/cmdline`, 'utf8')).split(
    '\0',
  )
  assert.equal(invokedInterpreter, interpreter)
  assert.equal(imageArgument, image.path)
  const env = (await readFile(`${proc}/environ`, 'utf8')).split('\0')
  assert.ok(env.includes('APPIMAGELAUNCHER_DISABLE=1'))
  return { executable, imageArgument, method: 'binfmt-type2', rule }
}

export async function captureAppImageFuse({ mainPid, wrapperPid, appImage, asarSha256 }) {
  assert.equal(process.platform, 'linux')
  const artifactRoot = path.join(os.userInfo().homedir, '.codex/artifacts/imagegen-studio')
  assert.equal(await realpath(artifactRoot), artifactRoot)
  assert.ok(path.isAbsolute(appImage) && inside(path.join(artifactRoot, 'runs'), appImage))
  assert.equal(await realpath(appImage), appImage, 'Capture the canonical owned AppImage path.')
  const image = await type2Image(appImage)
  assert.notEqual(mainPid, wrapperPid, 'The native AppImage runtime must remain the launcher.')
  const wrapper = await currentProcess(wrapperPid)
  assert.equal(wrapper.parent, process.pid, 'The wrapper is this qualification process child.')
  const launcher = await launcherWitness(wrapperPid, image)
  const main = await currentProcess(mainPid)
  // Read only the named process chain, never unrelated mount holders.
  const ancestry = [main]
  while (ancestry.at(-1).pid !== wrapperPid && ancestry.length < 16) {
    ancestry.push(await currentProcess(ancestry.at(-1).parent))
  }
  assert.deepEqual(ancestry.at(-1), wrapper, 'Packaged Main must descend from the exact launcher.')
  const proc = `/proc/${mainPid}`
  const executable = await readlink(`${proc}/exe`)
  const mountpoint = path.dirname(executable)
  const env = (await readFile(`${proc}/environ`, 'utf8')).split('\0')
  const appDir = env.find((entry) => entry.startsWith('APPDIR='))
  const appImageEntry = env.find((entry) => entry.startsWith('APPIMAGE='))
  const mounted = await exactMount(proc, mountpoint)
  const temporary = process.env.TMPDIR
  assert.ok(temporary && path.isAbsolute(temporary) && inside(artifactRoot, temporary))
  assert.equal(await realpath(temporary), temporary)
  assert.equal(path.dirname(mountpoint), temporary)
  assert.match(path.basename(mountpoint), /^\.mount_[\w.+-]+$/)
  assert.equal(path.basename(executable), 'imagegen-studio')
  assert.equal(await realpath(executable), executable)
  const namespace = await readlink(`${proc}/ns/mnt`)
  assert.equal(namespace, await readlink('/proc/self/ns/mnt'))
  assert.equal(namespace, await readlink(`/proc/${wrapperPid}/ns/mnt`))
  assert.ok(mounted, 'Main executable must reside on an actual mount at its AppDir.')
  assert.deepEqual(await exactMount('/proc/self', mountpoint), mounted)
  assert.match(mounted.id, /^[1-9][0-9]*$/)
  assert.match(mounted.device, /^[0-9]+:[0-9]+$/)
  assert.equal(mounted.root, '/')
  assert.match(mounted.type, /^fuse(?:\..+)?$/)
  if (launcher.method === 'binfmt-type2') {
    assert.equal(mounted.type, `fuse.${path.basename(appImage)}`)
    assert.equal(mounted.source, path.basename(appImage))
  }
  assert.ok(mounted.options.split(',').includes('ro'), 'The AppImage mount must be read-only.')
  assert.ok(mounted.superOptions.split(',').includes(`user_id=${process.getuid()}`))
  // /proc only exposes the kernel's initial environment. The live executable
  // and pinned wrapper inode provide ownership even if AppRun has changed it.
  if (appDir) assert.equal(appDir, `APPDIR=${mountpoint}`)
  if (appImageEntry) assert.equal(appImageEntry, `APPIMAGE=${appImage}`)
  assert.match(asarSha256 ?? '', /^[0-9a-f]{64}$/)
  const asar = path.join(mountpoint, 'resources/app.asar')
  assert.equal(await realpath(asar), asar)
  const asarEntry = await lstat(asar)
  assert.ok(asarEntry.isFile())
  assert.equal(asarEntry.dev, (await lstat(executable)).dev)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(asar)) hash.update(chunk)
  assert.equal(hash.digest('hex'), asarSha256)
  assert.deepEqual(await currentProcess(mainPid), main)
  assert.deepEqual(await currentProcess(wrapperPid), wrapper)
  assert.deepEqual(inode(await lstat(appImage, { bigint: true })), {
    device: image.device,
    inode: image.inode,
  })
  return {
    image,
    main,
    wrapper,
    launcher,
    ancestry,
    executable,
    namespace,
    mount: mounted,
    asar: { path: asar, sha256: asarSha256, sizeBytes: asarEntry.size },
  }
}

/** Observe unmount only after the caller's ordinary close and process-exit checks. */
export async function assertAppImageFuseUnmounted(witness) {
  const { namespace, mount } = witness
  assert.equal(await readlink('/proc/self/ns/mnt'), namespace)
  const deadline = performance.now() + 8000
  while (performance.now() < deadline) {
    const lines = (await readFile('/proc/self/mountinfo', 'utf8')).trimEnd().split('\n')
    const retained = lines.some((line) => {
      const [id, , device, , mountpoint] = line.split(' ')
      return (
        decodeMount(mountpoint) === mount.mountpoint || (id === mount.id && device === mount.device)
      )
    })
    if (!retained) {
      return { mountpoint: mount.mountpoint, id: mount.id, device: mount.device, unmounted: true }
    }
    await delay(75)
  }
  assert.fail(`Owned AppImage mount still present after normal close: ${mount.mountpoint}`)
}
