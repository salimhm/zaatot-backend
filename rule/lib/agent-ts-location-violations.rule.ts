import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = '.agent.ts location violations'

export async function check() {
  const globs = ['**/*.agent.ts', '**/*.prompt.agent.ts', '**/*.schema.agent.ts']
  const violations: string[] = []
  for (const pattern of globs) {
    const glob = new Glob(pattern)
    const all_paths = await Array.fromAsync(glob.scan(SRC_DIR))
    for (const p of all_paths) {
      if (!p.startsWith('ai/agent/'))
        violations.push(`  ${SRC_DIR}/${p} → .agent.ts / .prompt.agent.ts / .schema.agent.ts files must be under ai/agent/`)
    }
  }
  return violations
}
