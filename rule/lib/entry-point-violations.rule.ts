import { Glob } from 'bun'
import { stat } from 'fs/promises'
import { basename, join } from 'path'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = 'Entry point violations'

export async function check() {
  const glob = new Glob('*')
  const paths = await Array.fromAsync(glob.scan(SRC_DIR))
  const violations: string[] = []
  for (const path of paths) {
    const fullPath = join(SRC_DIR, path)
    const fileStat = await stat(fullPath).catch(() => null)
    if (!fileStat?.isFile()) continue
    const name = basename(path)
    if (name !== name.toLowerCase()) continue
    if (name !== 'app.ts') violations.push(`  ${SRC_DIR}/${path} → only 'app.ts' is allowed in src/ root`)
  }
  return violations
}
