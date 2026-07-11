import type { Config } from 'prettier'

const config: Config = {
  htmlWhitespaceSensitivity: 'ignore',
  plugins: ['prettier-plugin-jsdoc'],
  printWidth: 100,
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
}

export default config
