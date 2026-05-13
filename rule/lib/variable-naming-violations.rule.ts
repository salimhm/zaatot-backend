import ts from 'typescript'

import { get_source_files, parse_file, SNAKE_CASE_REGEX } from '../utils.rule.ts'

export const rule_label = 'Variable naming violations'

export async function check() {
  const paths = await get_source_files()
  const violations: string[] = []
  for (const relativePath of paths) {
    const { sourceFile } = await parse_file(relativePath)
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const name = node.name.text
        if (!SNAKE_CASE_REGEX.test(name)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
          violations.push(`  ${relativePath}:${line + 1} → variable '${name}' must be snake_case`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return violations
}
