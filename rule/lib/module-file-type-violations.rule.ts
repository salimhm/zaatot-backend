import { stat } from 'fs/promises'
import { basename, join } from 'path'

import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = 'Module file type violations'

export async function check() {
  const glob = new Glob('module/**/*')
  const paths = await Array.fromAsync(glob.scan(SRC_DIR))
  const violations: string[] = []
  for (const path of paths) {
    const fullPath = join(SRC_DIR, path)
    const fileStat = await stat(fullPath).catch(() => null)
    if (fileStat?.isFile()) {
      const name = basename(path)
      if (name.startsWith('.')) continue
      if (name !== name.toLowerCase()) continue
      const is_valid = name.endsWith('.controller.ts') || name.endsWith('.service.ts') || name.endsWith('.dto.ts') || name.endsWith('.test.ts')
      if (!is_valid) violations.push(`  ${SRC_DIR}/${path} → '${name}' is not a .controller.ts, .service.ts, .dto.ts, or .test.ts file`)
    }
  }
  return violations
}
