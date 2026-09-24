import { agent_detective } from '@agent/detective/detective.agent'

const message = process.argv.slice(2).join(' ').trim()

if (!message) throw new Error('Provide a product name, brand name, or barcode.')

const result = await agent_detective(message)
console.log(JSON.stringify(result, null, 2))
process.exit(result.success ? 0 : 1)
