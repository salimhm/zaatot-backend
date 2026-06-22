import { readdir } from 'fs/promises'
import { join } from 'path'

import { SRC_DIR } from '../utils.rule.ts'

export const rule_label = 'Folder structure violations'

export async function check() {
  const violations: string[] = []

  async function checkDir(dir: string, allowedDirs: string[] | null, allowedFiles: string[] | null, strictFiles: boolean = false) {
    let entries
    try {
      entries = await readdir(join(process.cwd(), dir), { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue

      if (entry.isDirectory()) {
        if (allowedDirs !== null && !allowedDirs.includes(entry.name)) {
          violations.push(
            `  ${dir}/${entry.name} is an unauthorized directory. Allowed directories: ${allowedDirs.length > 0 ? allowedDirs.join(', ') : 'None'}`,
          )
        }
      } else if (entry.isFile()) {
        if (strictFiles && allowedFiles !== null && !allowedFiles.includes(entry.name)) {
          violations.push(
            `  ${dir}/${entry.name} is an unauthorized file. Allowed files: ${allowedFiles.length > 0 ? allowedFiles.join(', ') : 'None'}`,
          )
        }
      }
    }
  }

  await checkDir(SRC_DIR, ['ai', 'db', 'lib', 'module', 'storage'], null, false)

  await checkDir(`${SRC_DIR}/module`, ['main', 'tenant', 'organization', 'user'], [], true)

  await checkDir(`${SRC_DIR}/module/main`, ['auth', 'tenant', 'user', 'organization', 'product', 'product-provider', 'scan', 'brand'], [], true)

  await checkDir(`${SRC_DIR}/module/tenant`, null, null, false)
  await checkDir(`${SRC_DIR}/module/organization`, null, null, false)
  await checkDir(`${SRC_DIR}/module/user`, null, null, false)

  await checkDir(`${SRC_DIR}/ai`, ['agent', 'tool'], ['utils.ai.ts'], true)

  await checkDir(`${SRC_DIR}/ai/agent`, null, null, false)
  await checkDir(`${SRC_DIR}/ai/tool`, null, null, false)

  await checkDir(`${SRC_DIR}/storage`, [], ['client.storage.ts'], true)

  await checkDir(`${SRC_DIR}/lib`, [], ['dto.lib.ts', 'enum.lib.ts', 'env.lib.ts', 'error.lib.ts', 'jwt.lib.ts', 'middleware.lib.ts'], true)

  await checkDir(
    `${SRC_DIR}/db`,
    [],
    ['client.db.ts', 'main.schema.db.ts', 'tenant.schema.db.ts', 'utils.db.ts', 'utils.dto.db.ts', 'organization.schema.db.ts', 'user.schema.db.ts'],
    true,
  )

  return violations
}
