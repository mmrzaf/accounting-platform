/** Import boundary guard for the current modular monolith skeleton. */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'

const root = process.cwd()
const src = resolve(root, 'src')
const errors: string[] = []
let checked = 0
function walk(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (/\.tsx?$/u.test(entry.name)) inspect(file)
  }
}
function layer(file: string): string {
  const name = relative(src, file).replaceAll('\\', '/')
  return name.split('/')[0] ?? ''
}
function inspect(file: string): void {
  checked++
  const own = layer(file)
  const contents = readFileSync(file, 'utf8')
  const imports = contents.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:[^;'"\n]*?\sfrom\s*)?['"](\.{1,2}\/[^'"\n]+)['"]/gu)
  for (const match of imports) {
    const specifier = match[1]
    if (!specifier) continue
    const target = resolve(dirname(file), specifier)
    if (!target.startsWith(src + '/')) continue
    const targetLayer = layer(target)
    if (own === 'shared' && targetLayer !== 'shared') errors.push(`${relative(root,file)}: shared cannot import ${specifier}`)
    if (own === 'modules' && (targetLayer === 'ui' || targetLayer === 'app')) errors.push(`${relative(root,file)}: domain cannot import ${specifier}`)
    if (own === 'platform' && targetLayer === 'ui') errors.push(`${relative(root,file)}: platform cannot import ${specifier}`)
    if (own === 'ui' && (targetLayer === 'platform' || targetLayer === 'modules')) errors.push(`${relative(root,file)}: ui can only import shared contracts, not ${specifier}`)
  }
}
walk(src)
if (errors.length) {
  for (const error of errors) console.error(error)
  process.exitCode = 1
} else {
  console.log(`Dependency boundaries verified: ${checked} module sources`)
}
