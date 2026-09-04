export type OverlayState = {
  listening: boolean
  paused: boolean
  answering: boolean
  status: string
  error: string
  answerError: string
  answer: string
  entries: Array<{
    id: string
    speaker: 'me' | 'interviewer'
    text: string
    timestamp: number
    translation?: string
  }>
  partialMe: string
  partialInterviewer: string
  sessionLabel?: string
  answerProvider?: string
  answerModel?: string
  visionModel?: string
  mode?: string
  responseStyle?: string
  autoTrigger?: boolean
  screenshotCount?: number
  codeAnswer?: string
  overlayTab?: 'answer' | 'code'
}

export type OverlayAction =
  | 'stop'
  | 'resume'
  | 'answer'
  | 'showSetup'
  | 'end'
  | 'toggleAuto'
  | 'capture'
  | 'captureRegion'
  | 'clearCaptures'
  | 'solve'
  | 'simulate'
  | 'debrief'
  | 'export'

export type LlmProvider = 'openai' | 'anthropic' | 'openrouter'

export type LlmModel = {
  id: string
  name: string
  provider: LlmProvider
  vision?: boolean
}

export type KeyStatus = {
  assemblyai: boolean
  openai: boolean
  anthropic: boolean
  openrouter: boolean
  provider: LlmProvider
  model: string
  visionProvider: LlmProvider
  visionModel: string
}

export type ConnectionResult = { ok: boolean; message: string }

export type CredentialPayload = {
  assemblyaiKey?: string
  openaiKey?: string
  anthropicKey?: string
  openrouterKey?: string
  provider?: LlmProvider
  model?: string
  visionProvider?: LlmProvider
  visionModel?: string
}

export type GeneratePayload = {
  transcript?: string
  resume?: string
  jobDescription?: string
  additionalInfo?: string
  company?: string
  role?: string
  prompt?: string
  customInstructions?: string
  mode?: string
  responseStyle?: 'brief' | 'bullets' | 'detailed'
  quickPrompt?: string
  images?: string[]
  task?: 'answer' | 'code' | 'translate' | 'debrief' | 'simulate' | 'preview'
  translateTo?: string
}

export type AnswerToken = {
  token?: string
  kind?: string
  reset?: boolean
}

export type CopilotAPI = {
  hasKeys: () => Promise<KeyStatus>
  saveCredentials: (payload: CredentialPayload) => Promise<KeyStatus>
  listModels: (payload: { provider: LlmProvider; apiKey?: string }) => Promise<LlmModel[]>
  testConnections: () => Promise<{
    assemblyai: ConnectionResult
    openai: ConnectionResult
    anthropic: ConnectionResult
    openrouter: ConnectionResult
  }>
  importResume: () => Promise<{ fileName: string; text: string } | null>
  getStreamingToken: () => Promise<string>
  generateAnswer: (payload: GeneratePayload) => Promise<string>
  captureDisplay: (options?: { region?: boolean }) => Promise<string | null>
  exportMarkdown: (payload: { markdown: string; fileName?: string }) => Promise<boolean>
  showOverlay: () => void
  showSetup: () => void
  publishOverlayState: (state: OverlayState) => void
  sendOverlayAction: (action: OverlayAction, payload?: string) => void
  onOverlayState: (callback: (state: OverlayState) => void) => () => void
  onOverlayAction: (callback: (action: OverlayAction, payload?: string) => void) => () => void
  onAnswerToken: (callback: (payload: AnswerToken) => void) => () => void
  minimize: () => void
  close: () => void
  completeRegionSelect: (rect: { x: number; y: number; width: number; height: number } | null) => void
}

declare global {
  interface Window {
    copilot: CopilotAPI
  }
}

export {}
