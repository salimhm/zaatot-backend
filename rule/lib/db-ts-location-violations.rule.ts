import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = '.db.ts location violations'

export async function check() {
  const globs = ['**/*.db.ts', '**/*.schema.db.ts', '**/*.dto.db.ts']
  const violations: string[] = []
  for (const pattern of globs) {
    const glob = new Glob(pattern)
    const all_paths = await Array.fromAsync(glob.scan(SRC_DIR))
    for (const p of all_paths) {
      if (!p.startsWith('db/')) violations.push(`  ${SRC_DIR}/${p} → .db.ts / .schema.db.ts / .dto.db.ts files must be under db/`)
    }
  }
  return violations
}
