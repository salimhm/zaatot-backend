import { Glob } from 'bun'

import { SRC_DIR } from '../utils.test.ts'

export const rule_label = '.tool.ts location violations'

export async function check() {
  const glob = new Glob('**/*.tool.ts')
  const all_paths = await Array.fromAsync(glob.scan(SRC_DIR))
  const violations: string[] = []
  for (const p of all_paths) {
    if (!p.startsWith('ai/tool/')) violations.push(`  ${SRC_DIR}/${p} → .tool.ts files must be under ai/tool/`)
  }
  return violations
}
