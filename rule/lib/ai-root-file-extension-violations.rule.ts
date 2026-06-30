import { stat } from 'fs/promises'
import { basename, join } from 'path'

import { Glob } from 'bun'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = 'ai/ root file extension violations'

export async function check() {
  const glob = new Glob('*')
  const paths = await Array.fromAsync(glob.scan(join(SRC_DIR, 'ai')))
  const violations: string[] = []
  for (const path of paths) {
    const fullPath = join(SRC_DIR, 'ai', path)
    const fileStat = await stat(fullPath).catch(() => null)
    if (!fileStat?.isFile()) continue
    const name = basename(path)
    if (name !== name.toLowerCase()) continue
    if (!name.endsWith('.ai.ts')) violations.push(`  ai/${path} → '${name}' must be <name>.ai.ts`)
  }
  return violations
}
