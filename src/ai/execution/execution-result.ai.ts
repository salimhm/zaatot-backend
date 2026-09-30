import type { type_schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'
import type { consumer_execution_data, consumer_execution_dependency, consumer_step_result } from '@ai/execution/execution-contract.ai'

import {
  build_temporary_explanation,
  collect_investigator_sources,
  readable_label,
  readable_list,
  summarize_investigator,
} from '@ai/execution/execution-explanation.ai'
import { schema_agent_conductor_result } from '@agent/conductor/conductor.schema.agent'
import { schema_agent_detective, schema_product_detective } from '@agent/detective/detective.schema.agent'
import { schema_agent_investigator } from '@agent/investigator/investigator.schema.agent'
import { schema_agent_medic } from '@agent/medic/medic.schema.agent'

// Builds the public result: the Gatekeeper-approved response when every selected check
// completed, otherwise a restrictive result that keeps unresolved work visible.
export const build_consumer_result = (
  data: consumer_execution_data,
  dependency: consumer_execution_dependency,
): type_schema_agent_conductor_result => {
  const allowed = data.bodyguard.safe && data.bodyguard.action === 'allow'
  const selected_implemented = data.dispatcher_plan?.selected_agents.filter((step) => Boolean(dependency.specialists?.[step.agent])) ?? []
  const steps = selected_implemented.flatMap((step) => {
    const result = data.agent_results[step.agent]
    return result ? [{ agent: step.agent, result }] : []
  })

  const incomplete = selected_implemented.filter((step) => data.agent_results[step.agent]?.status !== 'completed')
  const medic_plan = data.dispatcher_plan?.selected_agents.find((step) => step.agent === 'Medic')
  const medic_requested = medic_plan !== undefined
  const medic_result = data.agent_results.Medic
  const medic_incomplete = medic_requested && medic_result?.status !== 'completed'
  const requested_medic_checks = medic_plan?.medic_checks?.map(readable_label) ?? ['clinical risk']
  const requested_medic_check_label = readable_list(requested_medic_checks)
  const missing_medic_check = !medic_incomplete
    ? null
    : medic_result
      ? 'Requested health assessment is incomplete: Medic returned ' +
        readable_label(medic_result.status) +
        ', so ' +
        requested_medic_check_label +
        ' did not complete.'
      : 'Requested health assessment is incomplete: Medic was unavailable, so ' + requested_medic_check_label + ' did not run.'
  const candidate_pending =
    Boolean(dependency.specialists?.['Bargain Hunter']) &&
    data.dispatcher_plan?.candidate_validation === 'repeat_required_checks' &&
    data.candidate_review?.status !== 'completed'
  const gatekeeper = data.agent_results.Gatekeeper
  if (allowed && incomplete.length === 0 && !medic_incomplete && !candidate_pending && gatekeeper?.status === 'completed') {
    // The Gatekeeper adapter must return the complete validated API response as output.
    const approved = schema_agent_conductor_result.parse(gatekeeper.output)
    return { ...approved, execution_id: data.execution_id }
  }

  const detective = schema_agent_detective.safeParse(data.agent_results.Detective?.output)
  const investigator = schema_agent_investigator.safeParse(data.agent_results.Investigator?.output)
  const investigator_sources = investigator.success ? collect_investigator_sources(investigator.data) : { sources: [], source_ids: [] }
  const detective_subject = detective.success && detective.data.status === 'identified' ? detective.data.subject : null
  const subject: type_schema_agent_conductor_result['subject'] = detective_subject?.name
    ? {
        type: detective_subject.type,
        name: detective_subject.name,
        barcode: detective_subject.type === 'product' ? detective_subject.barcode : null,
        brand: detective_subject.type === 'brand' ? detective_subject.name : detective_subject.brand_name,
      }
    : null
  const detective_product =
    detective.success && subject?.type === 'product'
      ? (detective.data.related_products.items.find((item) => item.barcode === subject.barcode) ?? null)
      : null
  // Re-parse the matched item to keep this boundary tied to the Detective item schema.
  const nutrition = detective_product ? schema_product_detective.parse(detective_product).nutrition : null
  const product =
    subject?.type === 'product'
      ? {
          barcode: subject.barcode,
          name: subject.name,
          brand: subject.brand,
          nutrition: nutrition
            ? {
                variant: {
                  barcode: nutrition.variant.product_barcode,
                  name: nutrition.variant.product_name ?? null,
                },
                serving: nutrition.serving,
                nutrients: nutrition.nutrients,
                sources: nutrition.sources,
                completeness: nutrition.completeness,
              }
            : null,
        }
      : null

  let outcome: type_schema_agent_conductor_result['outcome'] = null
  if (allowed && investigator.success) outcome = investigator.data.status
  else if (allowed && detective.success && detective.data.status === 'unavailable') outcome = 'unavailable'
  else if (allowed && detective.success && detective.data.status !== 'identified') outcome = 'needs_input'
  // outcome describes the investigation; a plan without Investigator has none to report.
  else if (allowed && subject && data.dispatcher_plan?.selected_agents.some((step) => step.agent === 'Investigator')) outcome = 'needs_review'

  const assessment_status = (status: consumer_step_result['status']) => {
    if (status === 'repair_required') return 'needs_review' as const
    if (status === 'not_implemented') return 'skipped' as const
    return status
  }
  const assessments = steps.map(({ agent, result }) => {
    const summary =
      agent === 'Detective' && detective.success
        ? detective.data.message
        : agent === 'Medic' && schema_agent_medic.safeParse(result.output).success
          ? schema_agent_medic.parse(result.output).summary
          : agent === 'Investigator' && investigator.success
            ? summarize_investigator(investigator.data)
            : (result.limitations[0] ?? `${agent} ${result.status}.`)
    return {
      agent,
      status: assessment_status(result.status),
      summary,
      source_ids: agent === 'Investigator' ? investigator_sources.source_ids : [],
      limitations: result.limitations,
    }
  })

  // Without an investigation, summarize the identity and the reviewed specialist findings instead.
  const explanation =
    subject && outcome
      ? build_temporary_explanation(subject, outcome, investigator.success ? investigator.data : null, investigator_sources.source_ids)
      : allowed && subject
        ? {
            summary: `Ztroop identified ${subject.name} as a ${subject.type}.`,
            reasons: assessments
              .filter((assessment) => assessment.agent !== 'Detective' && assessment.status === 'completed')
              .map((assessment) => assessment.summary)
              .slice(0, 4),
            tradeoffs: [],
            citation_ids: [],
          }
        : null

  let status: type_schema_agent_conductor_result['status'] = 'needs_review'
  if (!allowed) status = data.bodyguard.action === 'human_review' ? 'needs_review' : 'blocked'
  else if (steps.some(({ result }) => result.status === 'blocked')) status = 'blocked'
  else if (steps.some(({ result }) => result.status === 'error')) status = 'error'
  else if (steps.some(({ result }) => result.status === 'needs_input')) status = 'needs_input'
  else if (steps.some(({ result }) => result.status === 'needs_review' || result.status === 'repair_required')) status = 'needs_review'
  else if (medic_incomplete) status = medic_result?.status === 'needs_input' ? 'needs_input' : 'needs_review'
  else if (selected_implemented.length === 0) status = 'partial'
  else if (incomplete.length > 0 || candidate_pending) status = 'needs_review'
  else status = 'completed'

  return {
    execution_id: data.execution_id,
    status,
    subject,
    outcome,
    product,
    assessments,
    alternatives: [],
    explanation,
    sources: investigator_sources.sources,
    limitations: !allowed
      ? ['The request did not pass the entry policy. No further agents were executed.']
      : [
          ...(selected_implemented.length === 0 ? ['No implemented specialist was selected for this request.'] : []),
          ...(missing_medic_check ? [missing_medic_check] : []),
          ...new Set(steps.flatMap(({ result }) => result.limitations)),
          ...(data.candidate_review?.limitations ?? []),
          ...(incomplete.length ? [`Unresolved implemented agents: ${incomplete.map((step) => step.agent).join(', ')}.`] : []),
        ],
    steps: [],
  }
}
