import { Glob } from 'bun'
import { stat } from 'fs/promises'
import { basename, join } from 'path'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = 'lib/ extension violations'

export async function check() {
  const glob = new Glob('**/*')
  const paths = await Array.fromAsync(glob.scan(join(SRC_DIR, 'lib')))
  const violations: string[] = []
  for (const path of paths) {
    const fullPath = join(SRC_DIR, 'lib', path)
    const fileStat = await stat(fullPath).catch(() => null)
    if (!fileStat?.isFile()) continue
    const name = basename(path)
    if (name !== name.toLowerCase()) continue
    if (!name.endsWith('.lib.ts')) violations.push(`  lib/${path} → '${name}' must be <name>.lib.ts`)
  }
  return violations
}
