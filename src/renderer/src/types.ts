export type Speaker = 'me' | 'interviewer'

export type TranscriptEntry = {
  id: string
  speaker: Speaker
  text: string
  timestamp: number
  translation?: string
}

export type AudioDevice = {
  deviceId: string
  label: string
}

export type InterviewerSource = 'system' | 'device'

export type SetupTab = 'dashboard' | 'interviews' | 'prompts' | 'settings'

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

export const LLM_PROVIDERS: Array<{ id: LlmProvider; label: string; keyPlaceholder: string }> = [
  { id: 'openai', label: 'OpenAI', keyPlaceholder: 'sk-...' },
  { id: 'anthropic', label: 'Claude', keyPlaceholder: 'sk-ant-...' },
  { id: 'openrouter', label: 'OpenRouter', keyPlaceholder: 'sk-or-...' }
]

export type InterviewStatus = 'upcoming' | 'live' | 'paused' | 'done'

export type InterviewMode =
  | 'behavioral'
  | 'recruiter'
  | 'technical'
  | 'coding'
  | 'system-design'
  | 'oa'
  | 'hr'
  | 'meeting'
  | 'casual'

export type ResponseStyle = 'brief' | 'bullets' | 'detailed'

export type GenerateTask = 'answer' | 'code' | 'translate' | 'debrief' | 'simulate' | 'preview'

export const INTERVIEW_MODES: Array<{ id: InterviewMode; label: string; promptId: string }> = [
  { id: 'behavioral', label: 'Behavioral', promptId: 'behavioral-star' },
  { id: 'recruiter', label: 'Recruiter screen', promptId: 'recruiter-screen' },
  { id: 'technical', label: 'Technical', promptId: 'technical' },
  { id: 'coding', label: 'Live coding', promptId: 'coding-live' },
  { id: 'system-design', label: 'System design', promptId: 'system-design' },
  { id: 'oa', label: 'Online assessment', promptId: 'online-assessment' },
  { id: 'hr', label: 'HR interview', promptId: 'hr-interview' },
  { id: 'meeting', label: 'Team meeting', promptId: 'team-meeting' },
  { id: 'casual', label: 'Casual conversation', promptId: 'casual-conversation' }
]

export const RESPONSE_STYLES: Array<{ id: ResponseStyle; label: string }> = [
  { id: 'brief', label: 'Brief hints' },
  { id: 'bullets', label: 'Bullet points' },
  { id: 'detailed', label: 'Detailed answer' }
]

export const SESSION_LANGUAGES: Array<{ id: string; label: string }> = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'de', label: 'German' },
  { id: 'fr', label: 'French' },
  { id: 'zh', label: 'Chinese' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ko', label: 'Korean' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'it', label: 'Italian' },
  { id: 'ar', label: 'Arabic' },
  { id: 'hi', label: 'Hindi' },
  { id: 'ru', label: 'Russian' }
]

export type PromptTemplate = {
  id: string
  name: string
  body: string
  builtIn?: boolean
  updatedAt: number
}

export type SavedAnswer = {
  id: string
  text: string
  createdAt: number
  kind?: 'answer' | 'code' | 'debrief'
}

export type InterviewSession = {
  id: string
  company: string
  role: string
  scheduledAt: string
  promptId: string
  resume: string
  jobDescription: string
  additionalInfo: string
  notes: string
  status: InterviewStatus
  mode: InterviewMode
  responseStyle: ResponseStyle
  sourceLanguage: string
  displayLanguage: string
  autoTrigger: boolean
  entries: TranscriptEntry[]
  answers: SavedAnswer[]
  codeAnswer?: string
  debrief?: string
  createdAt: number
  updatedAt: number
}
