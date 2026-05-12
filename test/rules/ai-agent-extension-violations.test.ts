import { stat } from 'fs/promises'
import { basename, join } from 'path'

import { Glob } from 'bun'

import { SRC_DIR } from '../utils.test.ts'

export const rule_label = 'ai/agent/ extension violations'

export async function check() {
  const glob = new Glob('agent/**/*')
  const paths = await Array.fromAsync(glob.scan(join(SRC_DIR, 'ai')))
  const violations: string[] = []
  for (const path of paths) {
    const fullPath = join(SRC_DIR, 'ai', path)
    const fileStat = await stat(fullPath).catch(() => null)
    if (!fileStat?.isFile()) continue
    const name = basename(path)
    if (name !== name.toLowerCase()) continue
    const is_valid =
      /^[a-z0-9-]+\.agent\.ts$/.test(name) || /^[a-z0-9-]+\.prompt\.agent\.ts$/.test(name) || /^[a-z0-9-]+\.schema\.agent\.ts$/.test(name)
    if (!is_valid) violations.push(`  ai/${path} → '${name}' must be <name>.agent.ts, <name>.prompt.agent.ts or <name>.schema.agent.ts`)
  }
  return violations
}
