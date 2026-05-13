import ts from 'typescript'

import { get_source_files, parse_file } from '../utils.rule.ts'

export const rule_label = 'Class naming violations'

export async function check() {
  const paths = await get_source_files()
  const violations: string[] = []
  for (const relativePath of paths) {
    const { sourceFile } = await parse_file(relativePath)
    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text
        if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
          violations.push(`  ${relativePath}:${line + 1} → class '${name}' must be PascalCase`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return violations
}
