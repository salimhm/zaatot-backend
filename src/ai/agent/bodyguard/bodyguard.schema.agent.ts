import { z } from 'zod'

export const SecurityDecision = z.object({
  safe: z.boolean(),
  riskLevel: z.enum(['none', 'low', 'medium', 'high', 'critical']),
  risks: z.array(
    z.enum([
      'prompt_injection',
      'jailbreak',
      'credential_exfiltration',
      'pii_exposure',
      'secret_extraction',
      'tool_abuse',
      'data_exfiltration',
      'command_injection',
      'sql_injection',
      'ssrf',
      'malicious_url',
      'malicious_code',
      'privilege_escalation',
      'policy_bypass',
      'resource_abuse',
      'unknown',
    ]),
  ),
  action: z.enum(['allow', 'sanitize', 'block', 'human_review']),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
})

export type type_schema_agent_bodyguard = z.infer<typeof SecurityDecision>
