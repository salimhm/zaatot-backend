import { Glob } from 'bun'

import { SRC_DIR } from '../utils.test.ts'

export const rule_label = '.test.ts location violations'

export async function check() {
  const glob = new Glob('**/*.test.ts')
  const paths = await Array.fromAsync(glob.scan(SRC_DIR))
  const violations = paths.map((p) => `  ${SRC_DIR}/${p} → .test.ts files are only allowed under test/`)
  return violations
}
