import { Glob } from 'bun'

import { SRC_DIR } from '../utils.test.ts'

export const rule_label = '.db.ts location violations'

export async function check() {
  const glob = new Glob('**/*.db.ts')
  const all_paths = await Array.fromAsync(glob.scan(SRC_DIR))
  const violations: string[] = []
  for (const p of all_paths) {
    if (!p.startsWith('db/')) violations.push(`  ${SRC_DIR}/${p} → .db.ts files must be under db/`)
  }
  return violations
}
