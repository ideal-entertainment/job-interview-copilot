import { contextBridge, ipcRenderer } from 'electron'

type OverlayState = {
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

type OverlayAction =
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

type LlmProvider = 'openai' | 'anthropic' | 'openrouter'

type KeyStatus = {
  assemblyai: boolean
  openai: boolean
  anthropic: boolean
  openrouter: boolean
  provider: LlmProvider
  model: string
  visionProvider: LlmProvider
  visionModel: string
}

type ConnectionResult = { ok: boolean; message: string }

type CredentialPayload = {
  assemblyaiKey?: string
  openaiKey?: string
  anthropicKey?: string
  openrouterKey?: string
  provider?: LlmProvider
  model?: string
  visionProvider?: LlmProvider
  visionModel?: string
}

type GeneratePayload = {
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

type AnswerToken = {
  token?: string
  kind?: string
  reset?: boolean
}

const api = {
  hasKeys: (): Promise<KeyStatus> => ipcRenderer.invoke('copilot:hasKeys'),
  saveCredentials: (payload: CredentialPayload): Promise<KeyStatus> =>
    ipcRenderer.invoke('copilot:saveCredentials', payload),
  listModels: (
    payload: { provider: LlmProvider; apiKey?: string }
  ): Promise<Array<{ id: string; name: string; provider: LlmProvider; vision?: boolean }>> =>
    ipcRenderer.invoke('copilot:listModels', payload),
  testConnections: (): Promise<{
    assemblyai: ConnectionResult
    openai: ConnectionResult
    anthropic: ConnectionResult
    openrouter: ConnectionResult
  }> => ipcRenderer.invoke('copilot:testConnections'),
  importResume: (): Promise<{ fileName: string; text: string } | null> =>
    ipcRenderer.invoke('copilot:importResume'),
  getStreamingToken: (): Promise<string> => ipcRenderer.invoke('copilot:streamingToken'),
  generateAnswer: (payload: GeneratePayload): Promise<string> =>
    ipcRenderer.invoke('copilot:generateAnswer', payload),
  captureDisplay: (options?: { region?: boolean }): Promise<string | null> =>
    ipcRenderer.invoke('copilot:captureDisplay', options),
  exportMarkdown: (payload: { markdown: string; fileName?: string }): Promise<boolean> =>
    ipcRenderer.invoke('copilot:exportMarkdown', payload),
  showOverlay: (): void => ipcRenderer.send('copilot:showOverlay'),
  showSetup: (): void => ipcRenderer.send('copilot:showSetup'),
  publishOverlayState: (state: OverlayState): void =>
    ipcRenderer.send('copilot:publishOverlayState', state),
  sendOverlayAction: (action: OverlayAction, payload?: string): void =>
    ipcRenderer.send('copilot:overlayAction', { action, payload }),
  onOverlayState: (callback: (state: OverlayState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: OverlayState): void => callback(state)
    ipcRenderer.on('copilot:overlayState', listener)
    return () => ipcRenderer.removeListener('copilot:overlayState', listener)
  },
  onOverlayAction: (
    callback: (action: OverlayAction, payload?: string) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: OverlayAction | { action?: OverlayAction; payload?: string }
    ): void => {
      if (typeof data === 'string') callback(data)
      else callback(data.action || 'answer', data.payload)
    }
    ipcRenderer.on('copilot:overlayAction', listener)
    return () => ipcRenderer.removeListener('copilot:overlayAction', listener)
  },
  onAnswerToken: (callback: (payload: AnswerToken) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AnswerToken): void => callback(payload)
    ipcRenderer.on('copilot:answerToken', listener)
    return () => ipcRenderer.removeListener('copilot:answerToken', listener)
  },
  minimize: (): void => ipcRenderer.send('copilot:minimize'),
  close: (): void => ipcRenderer.send('copilot:close'),
  completeRegionSelect: (rect: { x: number; y: number; width: number; height: number } | null): void =>
    ipcRenderer.send('copilot:regionResult', rect)
}

contextBridge.exposeInMainWorld('copilot', api)
