import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const eslint = fileURLToPath(new URL('../node_modules/eslint/bin/eslint.js', import.meta.url))
const flags = process.argv.slice(2)

// These disjoint scopes cover the same tree as `eslint .`. Separate processes release parser and
// formatter state between scopes; each child collects garbage before exhausting a 3GiB test group.
const scopes = [
  ['.', '--ignore-pattern', 'src/**', '--ignore-pattern', 'docs/**'],
  ['src'],
  ['docs/prototype-app'],
  ['docs', '--ignore-pattern', 'docs/prototype-app/**'],
]
for (const scope of scopes) {
  console.log(`ESLint ${scope.join(' ')}`)
  // A partition can contain only ignored/unconfigured types (currently non-prototype Markdown).
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=2048', eslint, '--no-error-on-unmatched-pattern', ...scope, ...flags],
    { cwd: root, env: process.env, stdio: 'inherit' },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
