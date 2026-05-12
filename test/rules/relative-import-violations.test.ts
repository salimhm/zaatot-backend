import ts from 'typescript'

import { get_source_files, parse_file } from '../utils.test.ts'

export const rule_label = 'Relative import violations'

export async function check() {
  const paths = await get_source_files()
  const violations: string[] = []
  for (const relativePath of paths) {
    const { sourceFile } = await parse_file(relativePath)
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const import_path = node.moduleSpecifier.text
        if (import_path.startsWith('.')) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
          violations.push(`  ${relativePath}:${line + 1} → '${import_path}' (use @module/, @lib/, etc.)`)
        }
      }
    })
  }
  return violations
}
