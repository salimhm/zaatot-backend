import { z } from 'zod'

export const schema_agent_bait_tester = z
  .object({
    safe: z.boolean(),
    action: z.enum(['allow', 'block']),
    risks: z.array(z.enum(['prompt_injection', 'tool_instruction', 'secret_request', 'data_exfiltration', 'malicious_payload'])),
    reason: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1),
  })
  .superRefine((value, context) => {
    if (value.safe !== (value.action === 'allow')) {
      context.addIssue({ code: 'custom', message: 'safe and action must agree' })
    }
    if (value.safe && value.risks.length > 0) {
      context.addIssue({ code: 'custom', message: 'Allowed content cannot contain detected risks' })
    }
  })

export type type_schema_agent_bait_tester = z.infer<typeof schema_agent_bait_tester>
