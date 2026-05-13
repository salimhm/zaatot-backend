import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = '.test.ts location violations'

export async function check() {
  const glob = new Glob('**/*.test.ts')
  const paths = await Array.fromAsync(glob.scan(SRC_DIR))
  const violations: string[] = []
  for (const p of paths) {
    if (!p.startsWith('module/')) violations.push(`  ${SRC_DIR}/${p} → .test.ts files must be inside module/`)
  }
  return violations
}
