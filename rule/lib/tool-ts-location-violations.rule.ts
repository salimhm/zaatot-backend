import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = '.tool.ts location violations'

export async function check() {
  const globs = ['**/*.tool.ts', '**/*.dto.tool.ts']
  const violations: string[] = []
  for (const pattern of globs) {
    const glob = new Glob(pattern)
    const all_paths = await Array.fromAsync(glob.scan(SRC_DIR))
    for (const p of all_paths) {
      if (!p.startsWith('ai/tool/')) violations.push(`  ${SRC_DIR}/${p} → .tool.ts / .dto.tool.ts files must be under ai/tool/`)
    }
  }
  return violations
}
