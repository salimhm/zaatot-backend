import { readFile } from 'fs/promises'
import { join } from 'path'

import { Glob } from 'bun'

import ts from 'typescript'

export const SRC_DIR = 'src'
export const SNAKE_CASE_REGEX = /^[$]?[a-z][a-z0-9_]*$/

export const get_source_files = async () => {
  const glob = new Glob('**/*.ts')
  return Array.fromAsync(glob.scan(SRC_DIR))
}

export const parse_file = async (relativePath: string) => {
  const fullPath = join(process.cwd(), SRC_DIR, relativePath)
  const content = await readFile(fullPath, 'utf-8')
  return {
    sourceFile: ts.createSourceFile(fullPath, content, ts.ScriptTarget.Latest, true),
    fullPath,
  }
}

export const GREEN = '\x1b[38;2;0;204;119m'
export const RED = '\x1b[38;2;255;0;0m'
export const BOLD = '\x1b[1m'
export const RESET = '\x1b[0m'

export const log_result = (label: string, violations: string[]) => {
  const separator = '\n------------------------------------------------------------------------------------\n\n'
  if (violations.length > 0) {
    const styled_violations = violations.map((v) => `${RED}${BOLD}${v}${RESET}`)
    console.error(`${RED}${BOLD}${separator} ✗ ${label}:${RESET}\n${styled_violations.join('\n')}`)
  } else {
    console.log(`${GREEN}${BOLD}${separator} ✓ ${label} successfully passed${RESET}`)
  }
}

export const run_rule = async (label: string, fn: () => Promise<string[]>) => {
  const violations = await fn()
  log_result(label, violations)
  return violations.length === 0
}

export type CodebaseRuleModule = {
  rule_label: string
  check: () => Promise<string[]>
}
