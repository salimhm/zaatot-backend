export const consumer_agent_names = [
  'Conductor',
  'Dispatcher',
  'Bodyguard',
  'Bait Tester',
  'Referee',
  'Skeptic',
  'Gatekeeper',
  'Vault Keeper',
  'Coach',
  'Historian',
  'Storyteller',
  'Detective',
  'Medic',
  'Investigator',
  'Eco Scout',
  'Bargain Hunter',
] as const

export type ConsumerAgentName = (typeof consumer_agent_names)[number]
export type ConsumerDepartment = 'Command' | 'Protection' | 'Personal' | 'Knowledge'
export type ConsumerResultStatus = 'completed' | 'partial' | 'blocked' | 'needs_input' | 'needs_review' | 'error'

export interface ConsumerAgentDefinition {
  agentname: ConsumerAgentName
  department: ConsumerDepartment
  role: string
  implementation: string
  depends_on?: readonly string[]
  existing_integration?: string
  /** Descriptions of proposed output fields, not runtime values or validation schemas. */
  result: Readonly<Record<string, string>>
  routing_rule?: string
  constraint?: string
}

export interface ConsumerWorkflowStage {
  stage: number
  agents: readonly ConsumerAgentName[]
  execution: string
  on_rejection?: string
  on_ambiguous_identity?: string
  candidate_validation?: string
  limit?: string
  on_validation_failure?: string
}

export interface ConsumerWorkflowDefinition {
  workflow_name: string
  implementation_status: string
  design: {
    supervisor: ConsumerAgentName
    principle: string
    execution: string
    result_convention: string
    store_a: string
  }
  flow: readonly ConsumerWorkflowStage[]
  cross_cutting_flow: {
    agent: ConsumerAgentName
    runs_when: string
    execution: string
    restriction: string
  }
  agents: readonly ConsumerAgentDefinition[]
  api_result: {
    proposed_endpoint: string
    execution: string
    output_access: string
    response_fields: Readonly<Record<string, string>>
    status_rule: string
  }
}

/** conductor = planner, define step, exctract intent */

/** Design metadata only: importing this module does not run agents or call providers. */
export const consumer_workflow_definition = {
  workflow_name: 'consumer_product_analysis',
  implementation_status:
    'Workflow scaffold: Bodyguard, Conductor, Dispatcher, Detective, on-demand Bait Tester and Investigator are implemented and connected. Remaining specialist stages, sequential gates, candidate review and response repair use replaceable placeholders. Missing agents never produce findings or successful checks.',
  design: {
    supervisor: 'Conductor',
    principle: 'Integrate all 16 roles, but execute only the specialists required for each request.',
    execution: 'Use deterministic code for routing, permissions, budgets and hard gates. Use AI for interpretation and bounded explanations.',
    result_convention: "Each agent's result below describes its proposed output fields, not actual findings.",
    store_a: 'Your consent-controlled personal data store; its exact implementation still needs to be defined.',
  },
  flow: [
    {
      stage: 1,
      agents: ['Conductor'],
      execution: 'Initialize execution state from an authenticated, validated API request.',
    },
    {
      stage: 2,
      agents: ['Bodyguard'],
      execution: 'Assess the request before specialist execution.',
      on_rejection: 'Skip analysis and send a minimal blocked response through Gatekeeper.',
    },
    {
      stage: 3,
      agents: ['Dispatcher'],
      execution: 'Select required specialists, establish dependencies and allocate time and tool-call budgets.',
    },
    {
      stage: 4,
      agents: ['Detective', 'Vault Keeper'],
      execution: 'Run independently in parallel when personal context is permitted and needed.',
      on_ambiguous_identity: 'Return needs_input instead of analyzing a guessed product.',
    },
    {
      stage: 5,
      agents: ['Medic', 'Investigator', 'Eco Scout', 'Historian'],
      execution: 'Run selected specialists in parallel after their required product or personal data is available.',
    },
    {
      stage: 6,
      agents: ['Skeptic', 'Referee'],
      execution: 'Skeptic checks evidence first. Referee then applies hard constraints and records disagreements.',
    },
    {
      stage: 7,
      agents: ['Coach'],
      execution: 'Score goal fit using reviewed findings and permitted personal preferences. Preserve all hard restrictions.',
    },
    {
      stage: 8,
      agents: ['Bargain Hunter'],
      execution: 'Run when alternatives are requested or useful.',
      candidate_validation:
        'Resolve candidate identities and rerun applicable specialist checks, Skeptic and Referee before recommending them. Use Coach scores when personalization is permitted.',
      limit: 'Dispatcher caps candidate count and review passes.',
    },
    {
      stage: 9,
      agents: ['Storyteller'],
      execution: 'Explain approved findings, limitations and eligible alternatives.',
    },
    {
      stage: 10,
      agents: ['Gatekeeper', 'Conductor'],
      execution: 'Gatekeeper validates the final response. Conductor returns the approved structured result to the API caller.',
      on_validation_failure: 'Allow a bounded repair attempt; otherwise return a minimal validated error response.',
    },
  ],
  cross_cutting_flow: {
    agent: 'Bait Tester',
    runs_when: 'A step encounters untrusted documents, website text or free-text provider content.',
    execution: 'Inspect content in isolation before downstream agents consume extracted evidence.',
    restriction: 'No personal vault access, privileged tools or authority to execute instructions found in content.',
  },
  agents: [
    {
      agentname: 'Conductor',
      department: 'Command',
      role: 'Own the complete workflow lifecycle, dependencies, execution state and final result.',
      implementation: 'Workflow supervisor',
      result: {
        execution_id: 'Unique workflow run identifier',
        status: 'completed | partial | blocked | needs_input | needs_review | error',
        data: 'Final response approved by Gatekeeper',
      },
    },
    {
      agentname: 'Dispatcher',
      department: 'Command',
      role: 'Translate the request into an execution plan and control latency, cost, retries and tool usage.',
      implementation: 'Deterministic router and budget controller',
      depends_on: ['Bodyguard'],
      result: {
        // intent: 'Requested analysis type', z.string().describ("Requested analysis type")

        selected_agents: 'Agents required for this request',
        required_checks: 'Checks that cannot be skipped',
        budgets: 'Timeout, tool-call, retry and alternative-candidate limits',
      },
    },
    {
      agentname: 'Bodyguard',
      department: 'Protection',
      role: 'Classify request risks and apply entry policy before any privileged action.',
      implementation: 'Classifier and policy rules',
      existing_integration: 'Current SecurityClassifier and SecurityDecision schema',
      result: {
        safe: 'boolean',
        riskLevel: 'none | low | medium | high | critical',
        risks: 'Detected risk categories',
        action: 'allow | sanitize | block | human_review',
        reason: 'Reason for the action',
        confidence: 'Number between 0 and 1',
      },
      routing_rule: 'Under your original policy, continue only when safe is true and action is allow.',
    },
    {
      agentname: 'Bait Tester',
      department: 'Protection',
      role: 'Extract usable evidence from untrusted content while identifying embedded instructions and suspicious material.',
      implementation: 'Sandboxed untrusted-content reader',
      result: {
        status: 'usable | suspicious | rejected',
        extracted_facts: 'Facts with source references',
        suspicious_content: 'Detected instruction attempts or anomalies',
        limitations: 'Extraction uncertainty',
      },
      constraint: 'Extracted facts remain unverified until evidence checks pass.',
    },
    {
      agentname: 'Referee',
      department: 'Protection',
      role: 'Apply hard safety constraints and record unresolved disagreements between findings.',
      implementation: 'Hard safety gate and disagreement recorder',
      depends_on: ['Skeptic', 'Selected specialist findings'],
      result: {
        decision: 'pass | restrict | block | needs_review',
        hard_constraints: 'Restrictions downstream agents must preserve',
        disagreements: 'Conflicting findings and their supporting evidence',
        excluded_candidates: 'Alternatives that fail required checks',
      },
      constraint: 'A preference score or persuasive explanation cannot override this decision.',
    },
    {
      agentname: 'Skeptic',
      department: 'Protection',
      role: 'Check whether claims are supported, current, relevant to the identified product and appropriately qualified.',
      implementation: 'Evidence, freshness and confidence gate',
      depends_on: ['Selected specialist findings'],
      result: {
        accepted_claims: 'Claims with adequate evidence',
        unsupported_claims: 'Claims excluded from conclusions',
        stale_sources: 'Evidence requiring refresh',
        uncertainties: 'Gaps and confidence limitations',
        targeted_rechecks: 'Additional retrieval requests within budget',
      },
    },
    {
      agentname: 'Gatekeeper',
      department: 'Protection',
      role: 'Validate the final schema, minimize personal data exposure, check citation references and enforce approved conclusions.',
      implementation: 'Final schema, privacy and citation gate',
      depends_on: ['Final response draft'],
      result: {
        status: 'approved | repair_required | rejected',
        validated_response: 'Client-facing payload when approved',
        violations: 'Schema, privacy, citation or constraint failures',
      },
    },
    {
      agentname: 'Vault Keeper',
      department: 'Personal',
      role: 'Retrieve only the personal context authorized and necessary for the selected analysis.',
      implementation: 'Consent-limited Store A retrieval tool',
      depends_on: ['Authenticated identity', 'Dispatcher'],
      result: {
        status: 'available | not_permitted | not_available',
        permitted_context: 'Relevant goals, preferences, restrictions or history',
        allowed_uses: 'Permitted purposes and consumers',
        missing_context: 'Unavailable fields that limit personalization',
      },
      constraint: 'Missing consent must not be interpreted as permission.',
    },
    {
      agentname: 'Coach',
      department: 'Personal',
      role: "Assess how well an eligible product fits the user's permitted goals and preferences.",
      implementation: 'Goal-fit scorer',
      depends_on: ['Vault Keeper', 'Reviewed findings', 'Referee'],
      result: {
        status: 'scored | insufficient_context | ineligible',
        fit_score: 'Defined-scale score, or null when unsupported',
        goal_matches: 'Supported matches to user goals',
        tradeoffs: 'Competing preferences and limitations',
      },
    },
    {
      agentname: 'Historian',
      department: 'Personal',
      role: 'Identify relevant patterns across permitted historical records.',
      implementation: 'Longitudinal trend analyzer',
      depends_on: ['Vault Keeper'],
      existing_integration: 'Scan history and user lists are potential inputs, subject to permission and suitability.',
      result: {
        status: 'available | insufficient_history | not_permitted',
        time_window: 'Period analyzed',
        patterns: 'Supported trends',
        limitations: 'Missing records and interpretation limits',
      },
      constraint: 'A scanned or saved product is not proof of purchase or consumption.',
    },
    {
      agentname: 'Storyteller',
      department: 'Personal',
      role: 'Generate a clear explanation from approved findings without adding unsupported claims.',
      implementation: 'Bounded explanation generator',
      depends_on: ['Skeptic', 'Referee', 'Coach when selected', 'Validated alternatives when selected'],
      result: {
        summary: 'Concise answer to the request',
        reasons: 'Evidence-backed explanation',
        tradeoffs: 'Relevant competing considerations',
        limitations: 'Unknowns and unavailable checks',
        citation_ids: 'References to the supplied evidence registry',
      },
    },
    {
      agentname: 'Detective',
      department: 'Knowledge',
      role: 'Resolve product identity and retrieve normalized catalog facts before dependent analysis.',
      implementation: 'Product identity and catalog retrieval',
      existing_integration: 'Product and brand services, barcode lookup and Open Food Facts',
      result: {
        status: 'identified | ambiguous | not_found',
        product: 'Resolved identity, brand and catalog attributes',
        candidates: 'Possible matches when ambiguous',
        sources: 'Provenance for retrieved facts',
        missing_fields: 'Facts required by downstream checks',
      },
    },
    {
      agentname: 'Medic',
      department: 'Knowledge',
      role: 'Apply defined clinical-risk rules to product facts and permitted personal restrictions.',
      implementation: 'Rules-first clinical-risk flagger',
      depends_on: ['Detective', 'Vault Keeper when personalization is required'],
      result: {
        status: 'flags_found | no_flags_detected | insufficient_data',
        risk_flags: 'Flags with supporting facts and rule identifiers',
        required_restrictions: 'Constraints for Referee evaluation',
        missing_information: 'Inputs preventing reliable assessment',
      },
      constraint: 'No flags detected does not establish universal safety.',
    },
    {
      agentname: 'Investigator',
      department: 'Knowledge',
      role: 'Retrieve ownership relationships, boycott evidence and ethics-related claims for the resolved entity.',
      implementation: 'Ownership and ethics graph retriever',
      depends_on: ['Detective'],
      existing_integration: 'Boycat provider and local boycott knowledge service; ownership graph coverage needs verification.',
      result: {
        entity_relationships: 'Supported brand and company relationships',
        boycott_status: 'boycott | not_boycotted | needs_review | unknown',
        claims: 'Attributed ethics findings',
        sources: 'Evidence with retrieval dates',
        alternatives: 'Provider-suggested candidates requiring separate validation',
      },
    },
    {
      agentname: 'Eco Scout',
      department: 'Knowledge',
      role: 'Retrieve environmental evidence and distinguish product-specific measurements from broader estimates.',
      implementation: 'Environmental-evidence retriever',
      depends_on: ['Detective'],
      existing_integration: 'Product ecoscore is available; broader evidence retrieval needs implementation.',
      result: {
        status: 'available | partial | unavailable',
        indicators: 'Supported environmental attributes',
        evidence_scope: 'Product, brand or category level',
        sources: 'Evidence and dates',
        limitations: 'Coverage and comparability gaps',
      },
    },
    {
      agentname: 'Bargain Hunter',
      department: 'Knowledge',
      role: 'Retrieve comparable alternatives and rank eligible candidates against user priorities and available price evidence.',
      implementation: 'Alternative-product retriever and ranker',
      depends_on: ['Detective', 'Referee', 'Coach when selected'],
      existing_integration: 'Product catalog and boycott alternatives provide candidate sources; live pricing is not established.',
      result: {
        status: 'found | none_found | insufficient_data',
        candidates: 'Alternatives with identity and comparison attributes',
        ranking: 'Ordering with explicit reasons',
        price_evidence: 'Price, currency, market and timestamp when available',
        validation_status: 'Per-candidate results of required checks',
      },
      constraint: 'Do not describe an alternative as safer, cheaper or better without the corresponding evidence.',
    },
  ],
  api_result: {
    proposed_endpoint: 'POST /ai/analyze',
    execution:
      'Accept prompt and user_id, verify the authenticated identity, run Bodyguard, and plan with Conductor then Dispatcher when allowed. Run configured selected adapters in dependency order; return partial for the placeholder configuration and publish findings only after final approval.',
    output_access: 'Read execution.result after verifying execution.status is completed.',
    response_fields: {
      execution_id: 'Workflow execution identifier',
      status: 'completed | partial | blocked | needs_input | needs_review | error',
      product: 'Resolved product identity, or null when unavailable',
      assessments: 'Reviewed contributions from all selected agents that executed',
      alternatives: 'Validated alternative products with reasons and source references',
      explanation: 'Gatekeeper-approved Storyteller explanation, or null before final review',
      sources: 'Cited evidence registry with retrieval dates',
      limitations: 'Explicit startup-only scope and any failure or entry-policy restriction',
    },
    status_rule:
      'A required safety check that cannot complete must produce needs_review or another restrictive outcome, never a successful recommendation.',
  },
} as const satisfies ConsumerWorkflowDefinition
