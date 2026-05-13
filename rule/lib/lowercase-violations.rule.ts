import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = 'Lowercase violations'

export async function check() {
  const glob = new Glob('**/*')
  const paths = await Array.fromAsync(glob.scan({ cwd: SRC_DIR, onlyFiles: false }))
  const violations: string[] = []
  for (const path of paths) {
    const parts = path.split('/')
    for (const part of parts) {
      if (part.startsWith('.') || part === '') continue
      const name = part.split('.')[0]!
      if (name !== name.toLowerCase()) {
        violations.push(`  ${SRC_DIR}/${path} → '${part}' must be lowercase`)
        break
      }
    }
  }
  return violations
}
