const form = document.querySelector('#analysis-form')
const promptInput = document.querySelector('#prompt')
const userIdInput = document.querySelector('#user-id')
const tokenInput = document.querySelector('#token')
const submitButton = document.querySelector('#submit-button')
const idleState = document.querySelector('#idle-state')
const loadingState = document.querySelector('#loading-state')
const errorState = document.querySelector('#error-state')
const errorMessage = document.querySelector('#error-message')
const elapsedTime = document.querySelector('#elapsed-time')
const resultElement = document.querySelector('#result')
const liveStepList = document.querySelector('#live-step-list')

const labels = {
  evidence_found: 'Evidence found',
  no_matching_evidence: 'No matching evidence',
  needs_input: 'Needs input',
  needs_review: 'Needs review',
  unavailable: 'Sources unavailable',
}

let elapsedTimer = null
let streamedSteps = []

function clearChildren(element) {
  while (element.firstChild) element.removeChild(element.firstChild)
}

function setRequestState(state, message = '') {
  idleState.hidden = state !== 'idle'
  loadingState.hidden = state !== 'loading'
  errorState.hidden = state !== 'error'
  resultElement.hidden = state !== 'result'
  if (state === 'error') errorMessage.textContent = message
}

function startElapsedTimer() {
  const startedAt = Date.now()
  elapsedTime.textContent = '0s'
  elapsedTimer = window.setInterval(() => {
    elapsedTime.textContent = `${Math.floor((Date.now() - startedAt) / 1000)}s`
  }, 1000)
}

function stopElapsedTimer() {
  if (elapsedTimer !== null) window.clearInterval(elapsedTimer)
  elapsedTimer = null
}

function appendTextItem(list, text) {
  const item = document.createElement('li')
  item.textContent = text
  list.append(item)
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function renderSources(sources) {
  const list = document.querySelector('#source-list')
  const section = document.querySelector('#sources-section')
  clearChildren(list)
  section.hidden = sources.length === 0
  document.querySelector('#source-count').textContent = `${sources.length}`

  for (const source of sources) {
    const item = document.createElement('li')
    const url = safeHttpUrl(source.url)
    const content = url ? document.createElement('a') : document.createElement('div')
    if (url) {
      content.href = url.href
      content.target = '_blank'
      content.rel = 'noreferrer noopener'
    } else {
      content.className = 'source-unlinked'
    }

    const provider = document.createElement('strong')
    provider.textContent = source.provider
    const detail = document.createElement('small')
    detail.textContent = url ? `${url.hostname} ↗` : 'No public URL'
    content.append(provider, detail)
    item.append(content)
    list.append(item)
  }
}

function renderLimitations(limitations) {
  const list = document.querySelector('#limitation-list')
  clearChildren(list)
  document.querySelector('#limitation-count').textContent = `${limitations.length}`
  if (limitations.length === 0) appendTextItem(list, 'No additional limitations were reported.')
  else limitations.forEach((limitation) => appendTextItem(list, limitation))
}

function latestSteps(events) {
  const operations = new Map()
  for (const event of events) {
    const current = operations.get(event.step_id)
    operations.set(event.step_id, {
      event,
      firstSequence: current?.firstSequence ?? event.sequence,
    })
  }
  return [...operations.values()].sort((left, right) => left.firstSequence - right.firstSequence).map((operation) => operation.event)
}

function renderWorkflowSteps(list, events) {
  clearChildren(list)
  const steps = latestSteps(events)

  for (const step of steps) {
    const item = document.createElement('li')
    item.dataset.status = step.status
    const context = document.createElement('small')
    const duration = Number.isInteger(step.metadata?.duration_ms) ? ` · ${step.metadata.duration_ms}ms` : ''
    context.textContent = `${step.agent || 'Workflow'} · ${step.status.replaceAll('_', ' ')}${duration}`
    const title = document.createElement('strong')
    title.textContent = step.title
    item.append(context, title)
    if (step.detail) {
      const detail = document.createElement('span')
      detail.textContent = step.detail
      item.append(detail)
    }
    list.append(item)
  }

  return steps.length
}

function fallbackAssessmentSteps(assessments) {
  return assessments.map((assessment, index) => ({
    sequence: index + 1,
    step_id: `assessment-${index}`,
    agent: assessment.agent,
    status: assessment.status,
    title: `${assessment.agent} finished`,
    detail: assessment.summary,
    metadata: { tool: null, duration_ms: null },
  }))
}

function renderResult(data) {
  const subject = data.subject
  document.querySelector('#subject-type').textContent = subject ? subject.type : 'Analysis result'
  document.querySelector('#subject-name').textContent = subject?.name || 'Unresolved request'
  document.querySelector('#subject-meta').textContent = subject?.barcode
    ? `Barcode ${subject.barcode}${subject.brand ? ` · ${subject.brand}` : ''}`
    : subject?.brand && subject.type === 'product'
      ? subject.brand
      : ''

  const badge = document.querySelector('#outcome-badge')
  badge.dataset.outcome = data.outcome || 'needs_review'
  badge.textContent = labels[data.outcome] || data.status.replaceAll('_', ' ')

  const explanation = data.explanation
  document.querySelector('#answer-summary').textContent = explanation?.summary || 'No user-facing explanation is available for this result yet.'
  const reasons = document.querySelector('#answer-reasons')
  clearChildren(reasons)
  reasons.hidden = !explanation?.reasons?.length
  for (const reason of explanation?.reasons || []) appendTextItem(reasons, reason)

  renderSources(Array.isArray(data.sources) ? data.sources : [])
  renderLimitations(Array.isArray(data.limitations) ? data.limitations : [])
  const steps = Array.isArray(data.steps) && data.steps.length > 0 ? data.steps : fallbackAssessmentSteps(data.assessments || [])
  const activityCount = renderWorkflowSteps(document.querySelector('#activity-list'), steps)
  document.querySelector('#activity-count').textContent = `${activityCount}`
  document.querySelector('#execution-id').textContent = data.execution_id
  setRequestState('result')
  resultElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function readEventStream(response) {
  if (!response.body) throw new Error('The API did not provide a readable event stream.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalPayload = null

  const handleBlock = (block) => {
    if (!block.trim() || block.trimStart().startsWith(':')) return
    let eventName = 'message'
    const dataLines = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim()
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (dataLines.length === 0) return
    const data = JSON.parse(dataLines.join('\n'))
    if (eventName === 'step') {
      streamedSteps.push(data)
      renderWorkflowSteps(liveStepList, streamedSteps)
    } else if (eventName === 'result') {
      finalPayload = data
    } else if (eventName === 'error') {
      throw new Error(data?.message || 'The workflow event stream failed.')
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replaceAll('\r\n', '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      handleBlock(block)
      boundary = buffer.indexOf('\n\n')
    }
    if (done) break
  }
  if (buffer.trim()) handleBlock(buffer)
  if (!finalPayload?.data) throw new Error('The workflow ended without a final analysis result.')
  return finalPayload
}

async function analyze(event) {
  event.preventDefault()
  const prompt = promptInput.value.trim()
  const userId = Number(userIdInput.value)
  const token = tokenInput.value.trim()
  if (!prompt || !Number.isSafeInteger(userId) || userId < 1 || !token) {
    setRequestState('error', 'Enter a question, a valid user ID, and an authenticated bearer token.')
    return
  }

  submitButton.disabled = true
  streamedSteps = []
  clearChildren(liveStepList)
  setRequestState('loading')
  startElapsedTimer()

  try {
    const response = await fetch('/ai/analyze', {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, user_id: userId }),
    })
    const refreshedToken = response.headers.get('X-Refresh-Token')
    if (refreshedToken) tokenInput.value = refreshedToken
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.message || payload?.error || `The API returned HTTP ${response.status}.`)
    }
    const contentType = response.headers.get('Content-Type') || ''
    const payload = contentType.includes('text/event-stream') ? await readEventStream(response) : await response.json().catch(() => null)
    if (!payload?.data) throw new Error('The API response did not contain analysis data.')
    renderResult(payload.data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected request error occurred.'
    setRequestState('error', message)
  } finally {
    stopElapsedTimer()
    submitButton.disabled = false
  }
}

form.addEventListener('submit', analyze)
document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    promptInput.value = button.dataset.prompt || ''
    promptInput.focus()
  })
})
