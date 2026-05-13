import type { CodebaseRuleModule } from './utils.rule.ts'

import * as agent_ts_location_violations from './lib/agent-ts-location-violations.rule.ts'
import * as ai_agent_extension_violations from './lib/ai-agent-extension-violations.rule.ts'
import * as ai_root_file_extension_violations from './lib/ai-root-file-extension-violations.rule.ts'
import * as ai_tool_extension_violations from './lib/ai-tool-extension-violations.rule.ts'
import * as class_naming_violations from './lib/class-naming-violations.rule.ts'
import * as controller_violations from './lib/controller-violations.rule.ts'
import * as db_extension_violations from './lib/db-extension-violations.rule.ts'
import * as db_ts_location_violations from './lib/db-ts-location-violations.rule.ts'
import * as dto_violations from './lib/dto-violations.rule.ts'
import * as entry_point_violations from './lib/entry-point-violations.rule.ts'
import * as function_naming_violations from './lib/function-naming-violations.rule.ts'
import * as kebab_case_violations from './lib/kebab-case-violations.rule.ts'
import * as lib_extension_violations from './lib/lib-extension-violations.rule.ts'
import * as lib_ts_location_violations from './lib/lib-ts-location-violations.rule.ts'
import * as lowercase_violations from './lib/lowercase-violations.rule.ts'
import * as module_file_location_violations from './lib/module-file-location-violations.rule.ts'
import * as module_file_type_violations from './lib/module-file-type-violations.rule.ts'
import * as relative_import_violations from './lib/relative-import-violations.rule.ts'
import * as service_violations from './lib/service-violations.rule.ts'
import * as test_ts_location_violations from './lib/test-ts-location-violations.rule.ts'
import * as tool_ts_location_violations from './lib/tool-ts-location-violations.rule.ts'
import * as ts_extension_violations from './lib/ts-extension-violations.rule.ts'
import * as variable_naming_violations from './lib/variable-naming-violations.rule.ts'
import { BOLD, GREEN, RED, RESET, run_rule } from './utils.rule.ts'

export const codebase_rules: CodebaseRuleModule[] = [
  lowercase_violations,
  kebab_case_violations,
  ts_extension_violations,
  module_file_type_violations,
  controller_violations,
  service_violations,
  dto_violations,
  relative_import_violations,
  variable_naming_violations,
  function_naming_violations,
  class_naming_violations,
  ai_agent_extension_violations,
  ai_tool_extension_violations,
  ai_root_file_extension_violations,
  db_extension_violations,
  lib_extension_violations,
  entry_point_violations,
  test_ts_location_violations,
  module_file_location_violations,
  lib_ts_location_violations,
  agent_ts_location_violations,
  tool_ts_location_violations,
  db_ts_location_violations,
]

export async function run_codebase_rules() {
  console.log(`${BOLD}\n🚀 Starting Codebase Rules Checks...\n${RESET}`)
  let success_count = 0
  let fail_count = 0
  for (const rule of codebase_rules) {
    const passed = await run_rule(rule.rule_label, rule.check)
    if (passed) success_count++
    else fail_count++
  }
  if (fail_count > 0) {
    console.error(`\n${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`)
    console.error(`${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━ ✖ FAILED: ${fail_count} CHECKS FAILED ━━━━━━━━━━━━━━━━━━━━ ${RESET}`)
    console.error(`${RED}${BOLD}━━━━━━━━━━━━━━━━━ Rules Passed: ${success_count} | Rules Failed: ${fail_count} ━━━━━━━━━━━━━━━ ${RESET}`)
    console.error(`${RED}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`)
    return false
  }
  console.log(`\n${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`)
  console.log(`${GREEN}${BOLD}━━━━━━━━━━━━━━━━ ✨ SUCCESS: ALL CHECKS PASSED ✨ ━━━━━━━━━━━━━━━━━━${RESET}`)
  console.log(`${GREEN}${BOLD}━━━━━━━━━━━━━━━━━ Passed: ${success_count} / ${success_count + fail_count} rules clean ━━━━━━━━━━━━━━━━━━━━━━${RESET}`)
  console.log(`${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`)
  return true
}

async function main() {
  const ok = await run_codebase_rules()
  if (!ok) process.exit(1)
  process.exit(0)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
