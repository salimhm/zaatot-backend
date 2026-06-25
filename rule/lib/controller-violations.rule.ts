import { basename, join } from 'path'

import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = 'Controller violations'

export async function check() {
  const glob = new Glob('module/**/*.controller.ts')
  const scanResult = await Array.fromAsync(glob.scan(SRC_DIR))
  const violations: string[] = []
  for (const relativePath of scanResult) {
    const fullPath = join(process.cwd(), SRC_DIR, relativePath)
    const filename = basename(relativePath)
    const table_name = filename.split('.')[0]!
    const expected = `controller_${table_name.replace(/-/g, '_')}`
    const module = await import(fullPath)
    if (module.default !== undefined) violations.push(`  ${relativePath} → has a default export (not allowed)`)
    if (!(expected in module)) violations.push(`  ${relativePath} → missing named export '${expected}'`)
  }
  return violations
}
