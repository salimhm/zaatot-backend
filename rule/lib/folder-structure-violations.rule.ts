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

  // 1. folders under the src folder strictly we need only to have ai db lib module and storage
  await checkDir(SRC_DIR, ['ai', 'db', 'lib', 'module', 'storage'], null, false)

  // 2. in the module folder stricly we need to have only main and tenant
  await checkDir(`${SRC_DIR}/module`, ['main', 'tenant'], [], true)

  // 3. inside main strictly only have auth tenant and user
  await checkDir(`${SRC_DIR}/module/main`, ['auth', 'tenant', 'user'], [], true)

  // 4. for tenant folder we can have any amount of folder so this is the free space
  await checkDir(`${SRC_DIR}/module/tenant`, null, null, false)

  // 5. ai stricly need to have only agent and tool folder and utils.ai.ts file nothing else
  await checkDir(`${SRC_DIR}/ai`, ['agent', 'tool'], ['utils.ai.ts'], true)

  // 6. under agent and tool we can have anything is also a free space like the tenant folder
  await checkDir(`${SRC_DIR}/ai/agent`, null, null, false)
  await checkDir(`${SRC_DIR}/ai/tool`, null, null, false)

  // 7. under storage strictly have only one file client.storage.ts no folder or another file
  await checkDir(`${SRC_DIR}/storage`, [], ['client.storage.ts'], true)

  // 8. lib folder same striclty only have the four files dto enum error and jwt
  await checkDir(`${SRC_DIR}/lib`, [], ['dto.lib.ts', 'enum.lib.ts', 'error.lib.ts', 'jwt.lib.ts'], true)

  // 9. db folder strictly only have the five files there
  await checkDir(`${SRC_DIR}/db`, [], ['client.db.ts', 'main.schema.db.ts', 'tenant.schema.db.ts', 'utils.db.ts', 'utils.dto.db.ts'], true)

  return violations
}
