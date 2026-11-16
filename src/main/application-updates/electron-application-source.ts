/**
 * Fresh donors: InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1
 * model_install/install_staging_ledger.py's Linux identity/marker admission and its
 * model_install_default.py/API startup callers; launcher c267bdb439519216b277a7a8c6ad408b9d79efce
 * updater.ts -> main-process-manager.ts. Neither exposes a loaded Electron archive identity. This
 * disclosed, version-pinned adapter supplies native descriptors to the existing FS owner.
 *
 * Electron44.4.5 primary sources:
 * https://github.com/electron/electron/blob/v44.4.5/lib/browser/init.ts
 * https://github.com/electron/electron/blob/v44.4.5/shell/common/api/electron_api_asar.cc
 * https://github.com/electron/electron/blob/v44.4.5/shell/common/asar/asar_util.cc
 * https://github.com/electron/electron/blob/v44.4.5/shell/common/asar/archive.h init.ts opens
 * packagePath before app.setAppPath(packagePath) and loading user Main. The exact same spelling
 * therefore hits the retained native cache, even after pathname replacement.
 * process._getOrCreateArchive is deleted before user Main; it is deliberately never used here.
 *
 * Capture is metadata-only and synchronous. Complete/hash work belongs under whenReady. This
 * detects consistency changes after capture; it does not attest earlier V8 memory, bind inner files
 * to a signed outer AppImage, prove health, own a cross-process lease or authorize cleanup.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, realpathSync } from 'node:fs'
import path from 'node:path'

import {
  type ApplicationUpdateCurrentSourceCapture,
  captureApplicationUpdateCurrentSource,
} from './application-update-staging.js'

export interface ElectronApplicationSourceInput {
  appPath: string
  arch: string
  currentAppImage: string | null
  electronVersion: string
  moduleDir: string
  moduleFilename: string
  packaged: boolean
  platform: string
  resourcesPath: string
}

/** Controlled unit ports only; production always opens its own kernel /proc/self/exe link. */
export interface ElectronApplicationSourceNativePort {
  readonly executablePath: string
  linkedBinding: (name: string) => unknown
  openExecutable: () => number
}

const executableFlags = constants.O_RDONLY | constants.O_NONBLOCK
const nativePort: ElectronApplicationSourceNativePort = {
  executablePath: process.execPath,
  linkedBinding: (name) => {
    const binding = (process as unknown as { _linkedBinding?: (name: string) => unknown })
      ._linkedBinding
    if (typeof binding !== 'function') {
      throw new TypeError('The native application archive is unavailable.')
    }
    return Reflect.apply(binding, process, [name])
  },
  // This one fixed kernel magic link is intentional. Never substitute process.execPath open.
  openExecutable: () => openSync('/proc/self/exe', executableFlags),
}

const canonicalPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  !value.includes('\0') &&
  path.isAbsolute(value) &&
  path.resolve(value) === value &&
  value !== path.parse(value).root

/** Main-private capability; unsupported or uncertain capture never aborts Project startup. */
export function captureElectronApplicationUpdateCurrentSource(
  input: ElectronApplicationSourceInput,
  port: ElectronApplicationSourceNativePort = nativePort,
): ApplicationUpdateCurrentSourceCapture | null {
  let executableFd: number | undefined
  let captured: ApplicationUpdateCurrentSourceCapture | undefined
  try {
    const executablePath = port.executablePath
    if (
      input.packaged !== true ||
      input.electronVersion !== '44.4.5' ||
      input.platform !== 'linux' ||
      input.arch !== 'x64' ||
      process.platform !== 'linux' ||
      process.arch !== 'x64' ||
      !canonicalPath(input.currentAppImage) ||
      !canonicalPath(input.resourcesPath) ||
      !canonicalPath(input.appPath) ||
      !canonicalPath(input.moduleDir) ||
      !canonicalPath(input.moduleFilename) ||
      input.appPath !== path.join(input.resourcesPath, 'app.asar') ||
      input.moduleDir !== path.join(input.appPath, 'dist/main') ||
      input.moduleFilename !== path.join(input.moduleDir, 'main.cjs') ||
      !canonicalPath(executablePath) ||
      path.basename(executablePath) !== 'imagegen-studio' ||
      input.resourcesPath !== path.join(path.dirname(executablePath), 'resources')
    ) {
      return null
    }
    const binding = port.linkedBinding('electron_common_asar')
    if (!binding || typeof binding !== 'object') {
      return null
    }
    const Archive: unknown = Reflect.get(binding, 'Archive')
    if (typeof Archive !== 'function') {
      return null
    }
    // Only this proven loader key is admitted. There is no normalized/fresh-path fallback.
    const archive: unknown = Reflect.construct(Archive, [input.appPath])
    if (!archive || typeof archive !== 'object') {
      return null
    }
    const getFd: unknown = Reflect.get(archive, 'getFdAndValidateIntegrityLater')
    if (typeof getFd !== 'function') {
      return null
    }
    const archiveFd: unknown = Reflect.apply(getFd, archive, [])
    if (
      typeof archiveFd !== 'number' ||
      !Number.isSafeInteger(archiveFd) ||
      archiveFd < 0 ||
      archiveFd > 0x7f_ff_ff_ff
    ) {
      return null
    }
    executableFd = port.openExecutable()
    if (!Number.isSafeInteger(executableFd) || executableFd < 0) {
      executableFd = undefined
      return null
    }
    const executable = fstatSync(executableFd, { bigint: true })
    const visible = lstatSync(executablePath, { bigint: true })
    if (
      !executable.isFile() ||
      !visible.isFile() ||
      visible.isSymbolicLink() ||
      executable.dev !== visible.dev ||
      executable.ino !== visible.ino ||
      executable.mode !== visible.mode ||
      executable.size !== visible.size ||
      executable.mtimeNs !== visible.mtimeNs ||
      executable.ctimeNs !== visible.ctimeNs ||
      realpathSync(executablePath) !== executablePath
    ) {
      throw new Error('The running executable is unavailable.')
    }
    captured = captureApplicationUpdateCurrentSource({
      archiveFd,
      archivePath: input.appPath,
      currentAppImage: input.currentAppImage,
      executableFd,
      executablePath,
    })
    const sourceCapture = captured
    const ownedExecutableFd = executableFd
    let disposed = false
    const dispose = () => {
      if (disposed) {
        return
      }
      disposed = true
      try {
        sourceCapture.dispose()
      } catch {
        // Disposal is also used on Main startup refusal; it cannot prevent Project access.
      } finally {
        try {
          closeSync(ownedExecutableFd)
        } catch {
          // This adapter never closes a borrowed native descriptor or retries a reused FD.
        }
      }
    }
    let pending: ReturnType<ApplicationUpdateCurrentSourceCapture['complete']> | undefined
    return Object.freeze({
      complete: () => {
        if (disposed) {
          return Promise.reject(new Error('The application source capture is unavailable.'))
        }
        pending ??= sourceCapture.complete().then(
          (source) => {
            if (disposed) {
              source.dispose()
              throw new Error('The application source capture is unavailable.')
            }
            return Object.freeze({
              assertCurrentSnapshot: () => source.assertCurrentSnapshot(),
              currentAppImage: source.currentAppImage,
              currentImage: source.currentImage,
              dispose,
              verifyCompleteSnapshot: async () => await source.verifyCompleteSnapshot(),
            })
          },
          (error: unknown) => {
            dispose()
            throw error
          },
        )
        return pending
      },
      dispose,
    })
  } catch {
    try {
      captured?.dispose()
    } catch {
      // Preserve the fail-closed update outcome even if a supplied private owner rejects cleanup.
    } finally {
      if (executableFd !== undefined) {
        try {
          closeSync(executableFd)
        } catch {
          // An invalid native descriptor is an unavailable capability, never a startup failure.
        }
      }
    }
    return null
  }
}
