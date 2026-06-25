import { stat } from 'fs/promises'
import { basename, join } from 'path'

import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = '.ts extension violations'

export async function check() {
  const glob = new Glob('**/*')
  const paths = await Array.fromAsync(glob.scan(SRC_DIR))
  const violations: string[] = []
  for (const path of paths) {
    const name = basename(path)
    if (name.startsWith('.')) continue
    if (name !== name.toLowerCase()) continue
    const fullPath = join(SRC_DIR, path)
    const fileStat = await stat(fullPath).catch(() => null)
    if (fileStat?.isFile() && !name.endsWith('.ts')) violations.push(`  ${SRC_DIR}/${path} → '${name}' is not a .ts file`)
  }
  return violations
}
