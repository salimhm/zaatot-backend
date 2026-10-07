import { Glob } from 'bun'

import { scan_paths, SRC_DIR } from '../utils.rule.ts'

export const rule_label = '.lib.ts location violations'

export async function check() {
  const glob = new Glob('**/*.lib.ts')
  const all_paths = await scan_paths(glob, SRC_DIR)
  const violations: string[] = []
  for (const p of all_paths) {
    if (!p.startsWith('lib/')) violations.push(`  ${SRC_DIR}/${p} → .lib.ts files must be under lib/`)
  }
  return violations
}
