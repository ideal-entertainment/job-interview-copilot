import type { InterviewMode, InterviewSession, PromptTemplate, ResponseStyle } from '../types'
import { INTERVIEW_MODES } from '../types'

const WORKSPACE_KEY = 'ic.workspace'

export const DEFAULT_PROMPT_ID = 'live-default'

export const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: DEFAULT_PROMPT_ID,
    name: 'Live job interview',
    builtIn: true,
    updatedAt: 0,
    body: `You are an interview copilot helping a candidate during a live job interview at {{company}} for the {{role}} role.

You will receive the full transcript so far (labeled Interviewer / Me).

Your task:
- Identify the most recent question the interviewer asked that the candidate has NOT yet answered (check "Me" turns for what's already been covered).
- Ignore small talk, filler, or already-answered questions.
- Generate a suggested answer as 3-5 concise bullet points.
- Ground the answer ONLY in the candidate's actual resume/experience below — do not invent accomplishments.
- If the question is behavioral, structure bullets loosely as S/T/A/R.
- Keep the suggestion readable in under 10 seconds.

Output ONLY the bullet points. No preamble.

--- CANDIDATE RESUME ---
{{resume}}

--- JOB DESCRIPTION ---
{{jobDescription}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`
  },
  {
    id: 'recruiter-screen',
    name: 'Recruiter screen',
    builtIn: true,
    updatedAt: 0,
    body: `You are helping a candidate on a recruiter / HR screen at {{company}} for {{role}}.

Focus on:
- A concise intro pitch (30–45 seconds)
- Why this company / role
- Salary, location, start date, and process questions — answer briefly and professionally
- Do not invent compensation numbers

Output 3-5 short bullets the candidate can say out loud.

--- RESUME ---
{{resume}}

--- JOB DESCRIPTION ---
{{jobDescription}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`
  },
  {
    id: 'behavioral-star',
    name: 'Behavioral (STAR)',
    builtIn: true,
    updatedAt: 0,
    body: `You are helping a candidate answer behavioral interview questions for {{role}} at {{company}}.

Use STAR: Situation, Task, Action, Result.
Pick stories ONLY from the resume. Quantify results when the resume supports it.
Keep it speakable in about 60 seconds.

Output:
- 1 line: which story to use
- Then 4 bullets: S / T / A / R

--- RESUME ---
{{resume}}

--- JOB DESCRIPTION ---
{{jobDescription}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`
  },
  {
    id: 'technical',
    name: 'Technical / coding',
    builtIn: true,
    updatedAt: 0,
    body: `You are a quiet technical interview copilot for a {{role}} interview at {{company}}.

Help the candidate with the latest interviewer question:
- Restate the problem in one line
- Give an approach (complexity if relevant)
- Then 3-5 implementation or talking bullets
- If it is a coding question, prefer a clear algorithm over full source unless they asked to write code
- Stay consistent with the candidate's resume stack. Do not invent jobs they did not list.

--- RESUME ---
{{resume}}

--- JOB DESCRIPTION ---
{{jobDescription}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`
  },
  {
    id: 'system-design',
    name: 'System design',
    builtIn: true,
    updatedAt: 0,
    body: `You are a system-design interview copilot for {{role}} at {{company}}.

For the latest design prompt:
- Clarify 3 requirements / constraints
- Sketch high-level components
- Call out 2 scale or tradeoff bullets
- Keep it conversational, not a textbook dump

Ground examples in the candidate's actual experience when possible.

--- RESUME ---
{{resume}}

--- JOB DESCRIPTION ---
{{jobDescription}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`
  },
  {
    id: 'coding-live',
    name: 'Live coding',
    builtIn: true,
    updatedAt: 0,
    body: `You are a live-coding interview copilot for {{role}} at {{company}}.

Help with the latest coding question or screenshot:
- Restate the problem in one line
- Give a clear approach and complexity
- Then the solution the candidate can type while talking
- Add short speak-aloud notes for each logical block
- Stay consistent with the resume stack. Do not invent jobs they did not list.

--- RESUME ---
{{resume}}

--- JOB DESCRIPTION ---
{{jobDescription}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`
  },
  {
    id: 'online-assessment',
    name: 'Online assessment',
    builtIn: true,
    updatedAt: 0,
    body: `You are helping a candidate on a timed online assessment for {{role}} at {{company}}.

From the transcript and any screenshots:
- Identify the current problem
- Give a correct, implementable solution
- Mention edge cases briefly
- Keep explanations short enough to use under time pressure

--- RESUME ---
{{resume}}

--- JOB DESCRIPTION ---
{{jobDescription}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`
  },
  {
    id: 'hr-interview',
    name: 'HR interview',
    builtIn: true,
    updatedAt: 0,
    body: `You are helping a candidate in an HR interview at {{company}} for {{role}}.

Focus on culture, motivation, process, and logistics. Be warm, concise, and honest.
Do not invent compensation numbers or policy details.

Output spoken-ready bullets.

--- RESUME ---
{{resume}}

--- JOB DESCRIPTION ---
{{jobDescription}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`
  },
  {
    id: 'team-meeting',
    name: 'Team meeting',
    builtIn: true,
    updatedAt: 0,
    body: `You are a meeting copilot helping the user contribute clearly at {{company}}.

From the latest discussion:
- Suggest a concise point they can say next
- Offer a clarifying question if useful
- Keep it professional and brief

--- CONTEXT ---
{{resume}}

--- BACKGROUND ---
{{jobDescription}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`
  },
  {
    id: 'casual-conversation',
    name: 'Casual conversation',
    builtIn: true,
    updatedAt: 0,
    body: `You are helping the user stay fluent in a casual professional conversation.

Suggest a natural next reply in 2-4 short bullets. No corporate jargon unless the other person used it.

--- CONTEXT ---
{{resume}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`
  }
]

export type Workspace = {
  sessions: InterviewSession[]
  prompts: PromptTemplate[]
  activeSessionId: string
  customInstructions: string
}

export function nowLocalInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function sessionTitle(session: InterviewSession): string {
  const company = session.company.trim()
  const role = session.role.trim()
  if (company && role) return `${company} · ${role}`
  return company || role || 'Untitled interview'
}

export function createSession(
  promptId: string,
  resume = '',
  scheduledAt = nowLocalInput()
): InterviewSession {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    company: '',
    role: '',
    scheduledAt,
    promptId,
    resume,
    jobDescription: '',
    additionalInfo: '',
    notes: '',
    status: 'upcoming',
    mode: 'behavioral',
    responseStyle: 'bullets',
    sourceLanguage: 'auto',
    displayLanguage: 'en',
    autoTrigger: false,
    entries: [],
    answers: [],
    codeAnswer: '',
    debrief: '',
    createdAt: now,
    updatedAt: now
  }
}

function normalizeSession(session: InterviewSession): InterviewSession {
  const mode: InterviewMode = INTERVIEW_MODES.some((item) => item.id === session.mode)
    ? session.mode
    : 'behavioral'
  const responseStyle: ResponseStyle =
    session.responseStyle === 'brief' || session.responseStyle === 'detailed'
      ? session.responseStyle
      : 'bullets'
  return {
    ...session,
    mode,
    responseStyle,
    sourceLanguage: session.sourceLanguage || 'auto',
    displayLanguage: session.displayLanguage || 'en',
    additionalInfo: session.additionalInfo || '',
    autoTrigger: Boolean(session.autoTrigger),
    codeAnswer: session.codeAnswer || '',
    debrief: session.debrief || '',
    entries: (session.entries || []).map((entry) => ({
      ...entry,
      translation: entry.translation || ''
    }))
  }
}

function mergePrompts(saved: PromptTemplate[]): PromptTemplate[] {
  const byId = new Map(saved.map((prompt) => [prompt.id, prompt]))
  for (const preset of DEFAULT_PROMPTS) {
    if (!byId.has(preset.id)) byId.set(preset.id, preset)
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Workspace>
      const prompts = mergePrompts(parsed.prompts || [])
      const sessions = (Array.isArray(parsed.sessions) ? parsed.sessions : []).map(normalizeSession)
      const activeSessionId =
        sessions.find((session) => session.id === parsed.activeSessionId)?.id ||
        sessions[0]?.id ||
        ''
      return {
        sessions,
        prompts,
        activeSessionId,
        customInstructions: parsed.customInstructions || ''
      }
    }
  } catch {
    // fall through to a fresh workspace
  }

  return {
    sessions: [],
    prompts: mergePrompts([]),
    activeSessionId: '',
    customInstructions: ''
  }
}

export function saveWorkspace(workspace: Workspace): void {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace))
}

export function todayKey(): string {
  return nowLocalInput().slice(0, 10)
}

export function formatSessionTime(scheduledAt: string): string {
  if (!scheduledAt) return 'No time'
  const date = new Date(scheduledAt)
  if (Number.isNaN(date.getTime())) return scheduledAt
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatSessionDuration(entries: InterviewSession['entries']): string {
  if (entries.length === 0) return 'No transcript'
  const start = entries[0].timestamp
  const end = entries[entries.length - 1].timestamp
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (mins < 60) return remainder ? `${mins}m ${remainder}s` : `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function formatTranscriptText(entries: InterviewSession['entries']): string {
  return entries
    .map((entry) => `${entry.speaker === 'interviewer' ? 'Interviewer' : 'Me'}: ${entry.text}`)
    .join('\n')
}

export function formatSessionExport(session: InterviewSession): string {
  const title = sessionTitle(session)
  const lines = [
    `# ${title}`,
    '',
    `- Role: ${session.role || '—'}`,
    `- Company: ${session.company || '—'}`,
    `- Mode: ${session.mode}`,
    `- Duration: ${formatSessionDuration(session.entries)}`,
    '',
    '## Transcript',
    '',
    formatTranscriptText(session.entries) || '(empty)',
    ''
  ]
  if (session.answers.length > 0) {
    lines.push('## Suggested answers', '')
    for (const answer of session.answers) {
      lines.push(`### ${new Date(answer.createdAt).toLocaleString()}`, '', answer.text, '')
    }
  }
  if (session.codeAnswer?.trim()) {
    lines.push('## Coding notes', '', session.codeAnswer.trim(), '')
  }
  if (session.debrief?.trim()) {
    lines.push('## Debrief', '', session.debrief.trim(), '')
  }
  if (session.additionalInfo?.trim()) {
    lines.push('## Additional information', '', session.additionalInfo.trim(), '')
  }
  if (session.notes.trim()) {
    lines.push('## Notes', '', session.notes.trim(), '')
  }
  return lines.join('\n')
}

export function formatCompactDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export type ActivityBucket = { key: string; label: string; count: number }
export type ModeMix = { id: string; label: string; count: number }

export type DashboardStats = {
  total: number
  done: number
  upcoming: number
  live: number
  answers: number
  turns: number
  practiceMs: number
  thisWeekDone: number
  activity: ActivityBucket[]
  modes: ModeMix[]
  nextUp: InterviewSession[]
  recent: InterviewSession[]
}

function localDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function buildDashboardStats(sessions: InterviewSession[]): DashboardStats {
  const now = new Date()
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const activity: ActivityBucket[] = []
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    activity.push({
      key: localDayKey(day),
      label: day.toLocaleDateString([], { weekday: 'short' }),
      count: 0
    })
  }
  const activityMap = new Map(activity.map((item) => [item.key, item]))
  const modeCounts = new Map<string, number>()

  let done = 0
  let upcoming = 0
  let live = 0
  let answers = 0
  let turns = 0
  let practiceMs = 0
  let thisWeekDone = 0

  for (const session of sessions) {
    if (session.status === 'done') done += 1
    else if (session.status === 'live' || session.status === 'paused') live += 1
    else upcoming += 1
    answers += session.answers.length
    turns += session.entries.length
    if (session.entries.length > 0) {
      practiceMs += Math.max(
        0,
        session.entries[session.entries.length - 1].timestamp - session.entries[0].timestamp
      )
    }
    if (session.status === 'done' && session.updatedAt >= weekAgo) thisWeekDone += 1
    const bucket = activityMap.get((session.scheduledAt || '').slice(0, 10))
    if (bucket) bucket.count += 1
    const mode = session.mode || 'behavioral'
    modeCounts.set(mode, (modeCounts.get(mode) || 0) + 1)
  }

  return {
    total: sessions.length,
    done,
    upcoming,
    live,
    answers,
    turns,
    practiceMs,
    thisWeekDone,
    activity,
    modes: INTERVIEW_MODES.map((item) => ({
      id: item.id,
      label: item.label,
      count: modeCounts.get(item.id) || 0
    }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count),
    nextUp: [...sessions]
      .filter((session) => session.status !== 'done')
      .sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''))
      .slice(0, 4),
    recent: [...sessions]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 5)
  }
}
