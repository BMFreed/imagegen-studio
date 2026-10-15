import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ProjectWorkerClient } from '../worker-client.js'

const ROOT = path.resolve(import.meta.dirname, '../../../..')

/** Actual derivatives-only child from checkout source; no ML/runtime installation is claimed. */
export async function createSourceOutputWorkerOwner(f: { root: string; scratch: string }) {
  const runtime = path.join(f.root, 'cpu-runtime')
  await mkdir(runtime, { mode: 0o700 })
  const executable = path.join(runtime, 'python')
  await writeFile(
    executable,
    `#!${path.join(ROOT, 'worker-python/.venv/bin/python')}
import os,sys
from pathlib import Path
assert sys.argv[1:] == ['-I', '-m', 'imagegen_worker']
Path(${JSON.stringify(path.join(runtime, 'pid'))}).write_text(str(os.getpid()))
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'worker-python/src'))})
from imagegen_worker.__main__ import main
raise SystemExit(main())
`,
    { mode: 0o700 },
  )
  await chmod(executable, 0o700)
  const clients: ProjectWorkerClient[] = []
  return {
    cleanup: async () => {
      for (const client of clients) {
        await client.close()
      }
    },
    clients,
    pid: async () => Number(await readFile(path.join(runtime, 'pid'), 'utf8')),
    start: async (signal: AbortSignal) => {
      const client = await ProjectWorkerClient.start(
        { pythonExecutable: executable, runtimeRoot: runtime, stagingBasePath: f.scratch },
        { requestTimeoutMs: 5000, shutdownWaitMs: 100, signal },
      )
      clients.push(client)
      return client
    },
  }
}
