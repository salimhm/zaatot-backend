import { stat } from 'fs/promises'
import { basename, join } from 'path'

import { Glob } from 'bun'

import { SRC_DIR } from '../utils.test.ts'

export const rule_label = 'db/ extension violations'

export async function check() {
  const glob = new Glob('**/*')
  const paths = await Array.fromAsync(glob.scan(join(SRC_DIR, 'db')))
  const violations: string[] = []
  for (const path of paths) {
    const fullPath = join(SRC_DIR, 'db', path)
    const fileStat = await stat(fullPath).catch(() => null)
    if (!fileStat?.isFile()) continue
    const name = basename(path)
    if (name !== name.toLowerCase()) continue
    const is_valid = name.endsWith('.db.ts') || name.endsWith('.schema.db.ts') || name.endsWith('.dto.db.ts')
    if (!is_valid) violations.push(`  db/${path} → '${name}' must be .db.ts, .schema.db.ts, or .dto.db.ts`)
  }
  return violations
}
