/** Verify that every checked source is TypeScript; generated JS belongs only in dist/. */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['src', 'scripts', 'tests', 'experiments']
const sources: string[] = []
const forbidden: string[] = []
function walk(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (/\.(?:[cm]?js|jsx)$/u.test(entry.name)) forbidden.push(path)
    else if (/\.tsx?$/u.test(entry.name)) sources.push(path)
  }
}
for (const root of roots) walk(root)
if (forbidden.length) {
  for (const path of forbidden) console.error(`JavaScript source forbidden: ${path}`)
  process.exit(1)
}
console.log(`Source extension policy passed: ${sources.length} TypeScript files; zero JavaScript sources. Syntax is verified by check:types`)
