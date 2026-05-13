import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = 'Kebab-case violations'

export async function check() {
  const glob = new Glob('**/*')
  const paths = await Array.fromAsync(glob.scan({ cwd: SRC_DIR, onlyFiles: false }))
  const violations: string[] = []
  for (const path of paths) {
    const parts = path.split('/')
    for (const part of parts) {
      if (part.startsWith('.') || part === '') continue
      if (part !== part.toLowerCase()) continue
      if (!/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/.test(part)) {
        violations.push(`  ${SRC_DIR}/${path} → '${part}' must use kebab-case (hyphen-separated segments)`)
        break
      }
    }
  }
  return violations
}
