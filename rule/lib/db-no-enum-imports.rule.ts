import ts from 'typescript'

import { get_source_files, parse_file } from '../utils.rule.ts'

export const rule_label = 'Database files must not import application enums'

export async function check() {
  const paths = await get_source_files()
  const violations: string[] = []
  for (const relativePath of paths) {
    if (!relativePath.startsWith('db/')) continue
    const { sourceFile } = await parse_file(relativePath)
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const import_path = node.moduleSpecifier.text
        if (import_path === '@lib/enum.lib') {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
          violations.push(
            `  src/${relativePath}:${line + 1} → '${import_path}' (Do not import application enums in database files to prevent migration issues)`,
          )
        }
      }
    })
  }
  return violations
}
