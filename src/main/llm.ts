export type LlmProvider = 'openai' | 'anthropic' | 'openrouter'

export type LlmModel = {
  id: string
  name: string
  provider: LlmProvider
  vision?: boolean
}

export const LLM_PROVIDERS: Array<{ id: LlmProvider; label: string }> = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Claude' },
  { id: 'openrouter', label: 'OpenRouter' }
]

const REQUEST_TIMEOUT_MS = 20000
const ANTHROPIC_VERSION = '2023-06-01'

export function providerLabel(provider: LlmProvider): string {
  return LLM_PROVIDERS.find((item) => item.id === provider)?.label || provider
}

export function isLlmProvider(value: unknown): value is LlmProvider {
  return value === 'openai' || value === 'anthropic' || value === 'openrouter'
}

function sortModels(models: LlmModel[]): LlmModel[] {
  return models.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

function isOpenAiChatModel(id: string): boolean {
  const lower = id.toLowerCase()
  if (
    /(embedding|whisper|tts|dall-e|davinci|babbage|ada-|moderation|transcribe|realtime|audio|image|sora|omni-moderation|computer-use)/.test(
      lower
    )
  ) {
    return false
  }
  return /^(gpt-|o[1-9]|chatgpt-|codex-)/.test(lower)
}

function isOpenAiVisionModel(id: string): boolean {
  const lower = id.toLowerCase()
  if (!isOpenAiChatModel(id)) return false
  if (/(gpt-3\.5|o1-mini|o1-preview)/.test(lower)) return false
  return true
}

async function listOpenAiModels(apiKey: string): Promise<LlmModel[]> {
  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  const body = (await response.json()) as {
    data?: Array<{ id?: string }>
    error?: { message?: string }
  }
  if (!response.ok) {
    throw new Error(body.error?.message || `OpenAI model list failed (${response.status})`)
  }

  return sortModels(
    (body.data || [])
      .map((item) => item.id?.trim())
      .filter((id): id is string => Boolean(id))
      .filter(isOpenAiChatModel)
      .map((id) => ({
        id,
        name: id,
        provider: 'openai' as const,
        vision: isOpenAiVisionModel(id)
      }))
  )
}

async function listAnthropicModels(apiKey: string): Promise<LlmModel[]> {
  const models: LlmModel[] = []
  let afterId = ''

  for (let page = 0; page < 10; page += 1) {
    const url = new URL('https://api.anthropic.com/v1/models')
    url.searchParams.set('limit', '100')
    if (afterId) url.searchParams.set('after_id', afterId)

    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const body = (await response.json()) as {
      data?: Array<{ id?: string; display_name?: string }>
      error?: { message?: string }
      has_more?: boolean
      last_id?: string
    }
    if (!response.ok) {
      throw new Error(body.error?.message || `Claude model list failed (${response.status})`)
    }

    for (const item of body.data || []) {
      const id = item.id?.trim()
      if (!id) continue
      models.push({
        id,
        name: item.display_name?.trim() || id,
        provider: 'anthropic',
        vision: true
      })
    }

    if (!body.has_more || !body.last_id) break
    afterId = body.last_id
  }

  return sortModels(models)
}

async function listOpenRouterModels(apiKey: string): Promise<LlmModel[]> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  const body = (await response.json()) as {
    data?: Array<{
      id?: string
      name?: string
      architecture?: {
        modality?: string
        input_modalities?: string[]
        output_modalities?: string[]
      }
    }>
    error?: { message?: string } | string
  }
  if (!response.ok) {
    const message =
      typeof body.error === 'string' ? body.error : body.error?.message || `OpenRouter model list failed (${response.status})`
    throw new Error(message)
  }

  const models: LlmModel[] = []
  for (const item of body.data || []) {
    const id = item.id?.trim()
    if (!id) continue
    const outputs = item.architecture?.output_modalities || []
    const inputs = item.architecture?.input_modalities || []
    const modality = item.architecture?.modality || ''
    if (outputs.length > 0 && !outputs.includes('text')) continue
    if (modality && !modality.includes('text')) continue
    models.push({
      id,
      name: item.name?.trim() || id,
      provider: 'openrouter',
      vision: inputs.includes('image') || /image/i.test(modality)
    })
  }

  return sortModels(models)
}

export async function listProviderModels(provider: LlmProvider, apiKey: string): Promise<LlmModel[]> {
  if (provider === 'anthropic') return listAnthropicModels(apiKey)
  if (provider === 'openrouter') return listOpenRouterModels(apiKey)
  return listOpenAiModels(apiKey)
}

export async function testProviderConnection(
  provider: LlmProvider,
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const models = await listProviderModels(provider, apiKey)
    if (models.length === 0) {
      return { ok: false, message: 'Connected, but no chat models were returned' }
    }
    return { ok: true, message: `Connected · ${models.length} models` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Connection failed' }
  }
}

export type LlmImage = {
  mediaType: string
  dataUrl: string
  base64: string
}

export type GenerateLlmInput = {
  provider: LlmProvider
  apiKey: string
  model: string
  systemPrompt: string
  userText: string
  images?: LlmImage[]
  maxTokens?: number
  onToken?: (token: string) => void
}

function parseDataUrl(dataUrl: string): LlmImage | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl.trim())
  if (!match) return null
  return { mediaType: match[1], dataUrl: dataUrl.trim(), base64: match[2] }
}

export function parseImages(dataUrls: string[] | undefined): LlmImage[] {
  return (dataUrls || []).map(parseDataUrl).filter((item): item is LlmImage => Boolean(item)).slice(0, 6)
}

async function readSse(
  response: Response,
  onEvent: (payload: string) => void
): Promise<void> {
  if (!response.body) {
    throw new Error('The model response could not be streamed.')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      onEvent(payload)
    }
  }
}

async function generateOpenAiCompatible(input: {
  url: string
  apiKey: string
  model: string
  systemPrompt: string
  userText: string
  images?: LlmImage[]
  extraHeaders?: Record<string, string>
  provider: LlmProvider
  maxTokens: number
  onToken?: (token: string) => void
}): Promise<string> {
  const headers = {
    Authorization: `Bearer ${input.apiKey}`,
    'Content-Type': 'application/json',
    ...input.extraHeaders
  }
  const userContent =
    input.images && input.images.length > 0
      ? [
          { type: 'text', text: input.userText },
          ...input.images.map((image) => ({
            type: 'image_url',
            image_url: { url: image.dataUrl }
          }))
        ]
      : input.userText
  const messages = [
    { role: 'system', content: input.systemPrompt },
    { role: 'user', content: userContent }
  ]

  const send = async (body: Record<string, unknown>): Promise<Response> =>
    fetch(input.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000)
    })

  let tokenKey: 'max_tokens' | 'max_completion_tokens' = 'max_tokens'
  let includeTemperature = true
  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      model: input.model,
      stream: true,
      messages,
      [tokenKey]: input.maxTokens
    }
    if (includeTemperature) body.temperature = 0.3
    return body
  }

  let response = await send(buildBody())
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: { message?: string } | string
    }
    const errorText = typeof errorBody.error === 'string' ? errorBody.error : errorBody.error?.message || ''
    if (/max_completion_tokens/i.test(errorText)) {
      tokenKey = 'max_completion_tokens'
      response = await send(buildBody())
    } else if (/temperature/i.test(errorText)) {
      includeTemperature = false
      response = await send(buildBody())
    } else {
      throw new Error(errorText || `${providerLabel(input.provider)} request failed (${response.status})`)
    }
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: { message?: string } | string
    }
    const message = typeof errorBody.error === 'string' ? errorBody.error : errorBody.error?.message
    throw new Error(message || `${providerLabel(input.provider)} request failed (${response.status})`)
  }

  let answer = ''
  await readSse(response, (payload) => {
    try {
      const json = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string } }>
      }
      const token = json.choices?.[0]?.delta?.content
      if (token) {
        answer += token
        input.onToken?.(token)
      }
    } catch {
      // ignore malformed SSE chunks
    }
  })

  answer = answer.trim()
  if (!answer) {
    throw new Error(`${providerLabel(input.provider)} returned an empty answer.`)
  }
  return answer
}

async function generateAnthropic(input: {
  apiKey: string
  model: string
  systemPrompt: string
  userText: string
  images?: LlmImage[]
  maxTokens: number
  onToken?: (token: string) => void
}): Promise<string> {
  const userContent =
    input.images && input.images.length > 0
      ? [
          { type: 'text', text: input.userText },
          ...input.images.map((image) => ({
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mediaType,
              data: image.base64
            }
          }))
        ]
      : input.userText

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': input.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens,
      temperature: 0.3,
      stream: true,
      system: input.systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    }),
    signal: AbortSignal.timeout(90000)
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(data.error?.message || `Claude request failed (${response.status})`)
  }

  let answer = ''
  await readSse(response, (payload) => {
    try {
      const json = JSON.parse(payload) as {
        type?: string
        delta?: { type?: string; text?: string }
      }
      if (json.type === 'content_block_delta' && json.delta?.text) {
        answer += json.delta.text
        input.onToken?.(json.delta.text)
      }
    } catch {
      // ignore malformed SSE chunks
    }
  })

  answer = answer.trim()
  if (!answer) {
    throw new Error('Claude returned an empty answer.')
  }
  return answer
}

export async function generateLlmAnswer(input: GenerateLlmInput): Promise<string> {
  const maxTokens = input.maxTokens || 700
  if (input.provider === 'anthropic') {
    return generateAnthropic({ ...input, maxTokens })
  }
  if (input.provider === 'openrouter') {
    return generateOpenAiCompatible({
      ...input,
      maxTokens,
      url: 'https://openrouter.ai/api/v1/chat/completions',
      extraHeaders: {
        'HTTP-Referer': 'https://interview-copilot.local',
        'X-Title': 'Interview Copilot'
      }
    })
  }
  return generateOpenAiCompatible({
    ...input,
    maxTokens,
    url: 'https://api.openai.com/v1/chat/completions'
  })
}
