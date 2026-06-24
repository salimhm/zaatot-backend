import { Glob } from 'bun'
import { stat } from 'fs/promises'
import { basename, join } from 'path'

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
      const allowed_suffixes = ['.controller.ts', '.service.ts', '.dto.ts', '.test.ts', '.provider.ts', '.util.ts', '.types.ts', '.seed.ts']
      const is_valid = allowed_suffixes.some((suffix) => name.endsWith(suffix))
      if (!is_valid) violations.push(`  ${SRC_DIR}/${path} → '${name}' must use one of these suffixes: ${allowed_suffixes.join(', ')}`)
    }
  }
  return violations
}
