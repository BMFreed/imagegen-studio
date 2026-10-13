import { ipcChannels } from '../../shared/api.js'
import type { ApiResult } from '../../shared/api.js'
import { parsePresetDefinition } from '../../shared/presets/preset-schema.js'

import type { PresetService } from './preset-service.js'

import { PresetRepositoryError } from './preset-repository.js'
import { PresetUnavailableError } from './preset-service.js'

type Caller = { mainFrame: unknown }
type Request = { sender: unknown; senderFrame: unknown }
type Registrar = {
  handle: (
    channel: string,
    handler: (event: Request, ...args: unknown[]) => Promise<ApiResult<unknown>>,
  ) => void
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const id = (input: unknown): input is string => typeof input === 'string' && UUID.test(input)
const oneId = (args: unknown[]) => args.length === 1 && id(args[0])
const optionsValid = (value: unknown, key: string): boolean =>
  value === undefined ||
  (typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).every((member) => member === key) &&
    (!Object.hasOwn(value, key) || typeof (value as Record<string, unknown>)[key] === 'boolean'))

/** Only the actual app window and its main frame may access the store. */
export function registerPresetIpc(
  registrar: Registrar,
  caller: Caller,
  service: PresetService,
): void {
  function register(
    channel: string,
    validate: (args: unknown[]) => boolean,
    action: (...args: unknown[]) => Promise<unknown>,
  ): void {
    registrar.handle(channel, async (event, ...args) => {
      if (event.sender !== caller || event.senderFrame !== caller.mainFrame) {
        return {
          error: { code: 'IPC_INVALID_CALLER', message: 'The preset request was rejected.' },
          ok: false,
        }
      }
      if (!validate(args)) {
        return {
          error: { code: 'PRESET_INPUT_INVALID', message: 'Preset arguments are invalid.' },
          ok: false,
        }
      }
      try {
        return { ok: true, value: await action(...args) }
      } catch (error) {
        if (error instanceof PresetRepositoryError || error instanceof PresetUnavailableError) {
          return { error: { code: error.code, message: error.message }, ok: false }
        }
        return {
          error: {
            code: 'PRESET_STORAGE_FAILED',
            message: 'The preset request could not be completed.',
          },
          ok: false,
        }
      }
    })
  }
  const definition = (input: unknown) => {
    try {
      return parsePresetDefinition(input)
    } catch {
      throw new PresetRepositoryError('PRESET_INPUT_INVALID', 'Preset settings are invalid.')
    }
  }
  register(
    ipcChannels.presets.create,
    (args) => args.length === 1,
    (input) => service.create(definition(input)),
  )
  register(
    ipcChannels.presets.get,
    (args) => args.length === 2 && id(args[0]) && optionsValid(args[1], 'includeDeleted'),
    (presetId, options) =>
      service.get(presetId as string, options as { includeDeleted?: boolean } | undefined),
  )
  register(
    ipcChannels.presets.list,
    (args) => args.length === 1 && optionsValid(args[0], 'deleted'),
    (options) => service.list(options as { deleted?: boolean } | undefined),
  )
  register(
    ipcChannels.presets.update,
    (args) => args.length === 2 && id(args[0]),
    (presetId, input) => service.update(presetId as string, definition(input)),
  )
  register(
    ipcChannels.presets.duplicate,
    (args) =>
      args.length === 2 && id(args[0]) && (args[1] === undefined || typeof args[1] === 'string'),
    (presetId, name) => service.duplicate(presetId as string, name as string | undefined),
  )
  register(ipcChannels.presets.softDelete, oneId, (presetId) =>
    service.softDelete(presetId as string),
  )
  register(ipcChannels.presets.restore, oneId, (presetId) => service.restore(presetId as string))
}
