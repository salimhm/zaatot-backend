import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = 'Module file location violations'

export async function check() {
  const glob = new Glob('**/*.{controller,dto,service}.ts')
  const all_paths = await Array.fromAsync(glob.scan(SRC_DIR))
  const violations: string[] = []
  for (const p of all_paths) {
    if (!p.startsWith('module/')) violations.push(`  ${SRC_DIR}/${p} → .controller/.dto/.service files must be under module/`)
  }
  return violations
}
