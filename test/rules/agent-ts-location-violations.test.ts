import { Glob } from 'bun'

import { SRC_DIR } from '../utils.test.ts'

export const rule_label = '.agent.ts location violations'

export async function check() {
  const glob = new Glob('**/*.agent.ts')
  const all_paths = await Array.fromAsync(glob.scan(SRC_DIR))
  const violations: string[] = []
  for (const p of all_paths) {
    if (!p.startsWith('ai/agent/')) violations.push(`  ${SRC_DIR}/${p} → .agent.ts files must be under ai/agent/`)
  }
  return violations
}
