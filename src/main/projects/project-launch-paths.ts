import path from 'node:path'

/** Main-owned arguments from the initial process or Electron's second-instance event. */
export class ProjectLaunchPaths {
  get hasPending(): boolean {
    return this.pending.size > 0
  }

  private readonly pending = new Set<string>()

  enqueue(arguments_: readonly string[], workingDirectory: string): boolean {
    let received = false
    let positionalOnly = false
    for (const argument of arguments_) {
      if (argument === '--' && !positionalOnly) {
        positionalOnly = true
        continue
      }
      if (
        (!positionalOnly && argument.startsWith('-')) ||
        /^[a-z][a-z\d+.-]*:\/\//i.test(argument) ||
        path.extname(argument).toLowerCase() !== '.igs' ||
        (!path.isAbsolute(argument) && !path.isAbsolute(workingDirectory))
      ) {
        continue
      }
      this.pending.add(path.resolve(workingDirectory, argument))
      received = true
    }
    return received
  }

  take(): string | null {
    const filename = this.pending.values().next().value
    if (filename === undefined) {
      return null
    }
    this.pending.delete(filename)
    return filename
  }
}
