import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import TranscriptPanel from './components/TranscriptPanel'
import AnswerPanel from './components/AnswerPanel'
import CodePanel from './components/CodePanel'
import SettingsPanel from './components/SettingsPanel'
import SessionsPanel from './components/SessionsPanel'
import PromptsPanel from './components/PromptsPanel'
import DashboardPanel from './components/DashboardPanel'
import Icon from './components/Icon'
import ControlBar from './components/ControlBar'
import { ensureMicPermission, listAudioInputs, startPcmCapture, startSystemAudioCapture, type CaptureHandle } from './lib/audioCapture'
import { connectAssemblyAI } from './lib/assemblyai'
import {
  createSession,
  DEFAULT_PROMPT_ID,
  formatSessionExport,
  loadWorkspace,
  saveWorkspace,
  sessionTitle
} from './lib/workspace'
import { languageLabel, looksLikeQuestion, needsTranslation } from './lib/questionDetect'
import type {
  AudioDevice,
  InterviewerSource,
  InterviewSession,
  KeyStatus,
  LlmModel,
  LlmProvider,
  PromptTemplate,
  SetupTab,
  Speaker,
  TranscriptEntry
} from './types'
import { LLM_PROVIDERS } from './types'
import brandMark from './assets/brand-mark.png'

type CaptureSession = {
  captures: CaptureHandle[]
  sockets: Array<{ close: () => void }>
}

const STORAGE = {
  mic: 'ic.micId',
  loopback: 'ic.loopbackId',
  interviewerSource: 'ic.interviewerSource'
}

function guessLoopback(devices: AudioDevice[]): string {
  const match = devices.find((d) =>
    /cable output|vb-audio|blackhole|loopback|stereo mix/i.test(d.label)
  )
  return match?.deviceId || ''
}

function guessMic(devices: AudioDevice[]): string {
  const match = devices.find(
    (d) => d.deviceId !== 'default' && !/cable|blackhole|loopback|stereo mix/i.test(d.label)
  )
  return match?.deviceId || devices[0]?.deviceId || ''
}

function readStartup(): {
  sessions: InterviewSession[]
  prompts: PromptTemplate[]
  activeSessionId: string
  selectedPromptId: string
  entries: TranscriptEntry[]
  answer: string
  customInstructions: string
} {
  const workspace = loadWorkspace()
  const active = workspace.sessions.find((session) => session.id === workspace.activeSessionId)
  return {
    sessions: workspace.sessions,
    prompts: workspace.prompts,
    activeSessionId: workspace.activeSessionId,
    selectedPromptId: active?.promptId || DEFAULT_PROMPT_ID,
    entries: active?.entries || [],
    answer: active?.answers?.at(-1)?.text || '',
    customInstructions: workspace.customInstructions || ''
  }
}

const EMPTY_KEY_STATUS: KeyStatus = {
  assemblyai: false,
  openai: false,
  anthropic: false,
  openrouter: false,
  provider: 'openai',
  model: '',
  visionProvider: 'openai',
  visionModel: ''
}

type ModelsByProvider = Partial<Record<LlmProvider, LlmModel[]>>

export default function App() {
  const [startup] = useState(readStartup)
  const [listening, setListening] = useState(false)
  const [paused, setPaused] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [status, setStatus] = useState('Idle')
  const [error, setError] = useState('')
  const [answerError, setAnswerError] = useState('')
  const [answer, setAnswer] = useState(startup.answer)
  const [entries, setEntries] = useState<TranscriptEntry[]>(startup.entries)
  const [partialMe, setPartialMe] = useState('')
  const [partialInterviewer, setPartialInterviewer] = useState('')
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [micId, setMicId] = useState(() => localStorage.getItem(STORAGE.mic) || '')
  const [loopbackId, setLoopbackId] = useState(() => localStorage.getItem(STORAGE.loopback) || '')
  const [interviewerSource, setInterviewerSource] = useState<InterviewerSource>(
    () => (localStorage.getItem(STORAGE.interviewerSource) as InterviewerSource) || 'system'
  )
  const [tab, setTab] = useState<SetupTab>('dashboard')
  const [sessions, setSessions] = useState<InterviewSession[]>(startup.sessions)
  const [prompts, setPrompts] = useState<PromptTemplate[]>(startup.prompts)
  const [activeSessionId, setActiveSessionId] = useState(startup.activeSessionId)
  const [selectedPromptId, setSelectedPromptId] = useState(startup.selectedPromptId)
  const [customInstructions, setCustomInstructions] = useState(startup.customInstructions)
  const [keyStatus, setKeyStatus] = useState<KeyStatus>(EMPTY_KEY_STATUS)
  const [assemblyaiKey, setAssemblyaiKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [provider, setProvider] = useState<LlmProvider>('openai')
  const [model, setModel] = useState('')
  const [visionProvider, setVisionProvider] = useState<LlmProvider>('openai')
  const [visionModel, setVisionModel] = useState('')
  const [modelsByProvider, setModelsByProvider] = useState<ModelsByProvider>({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [loadingProvider, setLoadingProvider] = useState<LlmProvider | null>(null)
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [credentialsMessage, setCredentialsMessage] = useState('')
  const [testingConnections, setTestingConnections] = useState(false)
  const [connectionTest, setConnectionTest] = useState<{
    assemblyai: { ok: boolean; message: string }
    openai: { ok: boolean; message: string }
    anthropic: { ok: boolean; message: string }
    openrouter: { ok: boolean; message: string }
  } | null>(null)
  const [importingResume, setImportingResume] = useState(false)
  const [resumeFileName, setResumeFileName] = useState('')
  const [screenshots, setScreenshots] = useState<string[]>([])
  const [codeAnswer, setCodeAnswer] = useState(startup.sessions.find((s) => s.id === startup.activeSessionId)?.codeAnswer || '')
  const [overlayTab, setOverlayTab] = useState<'answer' | 'code'>('answer')
  const [debriefing, setDebriefing] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [previewAnswer, setPreviewAnswer] = useState('')
  const [previewError, setPreviewError] = useState('')

  const sessionRef = useRef<CaptureSession | null>(null)
  const startingRef = useRef(false)
  const transcriptRef = useRef<TranscriptEntry[]>(startup.entries)
  const turnIndexRef = useRef(new Map<string, number>())
  const autoTimerRef = useRef(0)
  const answeringRef = useRef(false)
  const autoTriggerRef = useRef(false)
  const generateRef = useRef<(kind: 'answer' | 'code', quickPrompt?: string) => Promise<void>>(async () => undefined)
  const screenshotsRef = useRef<string[]>([])
  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0]
  const activePrompt =
    prompts.find((prompt) => prompt.id === activeSession?.promptId) ||
    prompts.find((prompt) => prompt.id === DEFAULT_PROMPT_ID)
  const models = modelsByProvider[provider] || []
  const visionModels = modelsByProvider[visionProvider] || []
  const providerLabel =
    LLM_PROVIDERS.find((item) => item.id === keyStatus.provider)?.label || 'Answer provider'
  const isAnswerReady = keyStatus[keyStatus.provider] && Boolean(keyStatus.model)
  const isVisionReady = keyStatus[keyStatus.visionProvider] && Boolean(keyStatus.visionModel)
  const isSolveReady = isVisionReady || isAnswerReady
  const sessionMode = activeSession?.mode || 'behavioral'
  const isCodingMode = sessionMode === 'coding' || sessionMode === 'oa'

  useEffect(() => {
    answeringRef.current = answering
  }, [answering])

  useEffect(() => {
    autoTriggerRef.current = Boolean(activeSession?.autoTrigger)
  }, [activeSession?.autoTrigger])

  const languageRef = useRef({
    source: activeSession?.sourceLanguage || 'auto',
    display: activeSession?.displayLanguage || 'en'
  })
  useEffect(() => {
    languageRef.current = {
      source: activeSession?.sourceLanguage || 'auto',
      display: activeSession?.displayLanguage || 'en'
    }
  }, [activeSession?.sourceLanguage, activeSession?.displayLanguage])

  const refreshDevices = useCallback(async () => {
    try {
      await ensureMicPermission()
      const list = await listAudioInputs()
      const mapped = list.map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${i + 1}`
      }))
      setDevices(mapped)
      setMicId((current) => {
        if (current && mapped.some((d) => d.deviceId === current)) return current
        const next = guessMic(mapped)
        localStorage.setItem(STORAGE.mic, next)
        return next
      })
      setLoopbackId((current) => {
        if (current && mapped.some((d) => d.deviceId === current)) return current
        const next = guessLoopback(mapped)
        localStorage.setItem(STORAGE.loopback, next)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not list audio devices')
    }
  }, [])

  useEffect(() => {
    void window.copilot.hasKeys().then(async (result) => {
      setKeyStatus(result)
      setProvider(result.provider)
      setModel(result.model)
      setVisionProvider(result.visionProvider)
      setVisionModel(result.visionModel)
      const next: ModelsByProvider = {}
      const providers = Array.from(
        new Set<LlmProvider>([result.provider, result.visionProvider])
      )
      await Promise.all(
        providers.map(async (item) => {
          if (!result[item]) return
          try {
            next[item] = await window.copilot.listModels({ provider: item })
          } catch {
            next[item] = []
          }
        })
      )
      setModelsByProvider(next)
    })
    void refreshDevices()
  }, [refreshDevices])

  useEffect(() => {
    localStorage.setItem(STORAGE.mic, micId)
  }, [micId])

  useEffect(() => {
    localStorage.setItem(STORAGE.loopback, loopbackId)
  }, [loopbackId])

  useEffect(() => {
    localStorage.setItem(STORAGE.interviewerSource, interviewerSource)
  }, [interviewerSource])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveWorkspace({ sessions, prompts, activeSessionId, customInstructions })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [activeSessionId, customInstructions, prompts, sessions])

  useEffect(() => {
    if (!activeSessionId) return
    setSessions((prev) => {
      const current = prev.find((session) => session.id === activeSessionId)
      if (current?.entries === entries) return prev
      return prev.map((session) =>
        session.id === activeSessionId ? { ...session, entries, updatedAt: Date.now() } : session
      )
    })
  }, [activeSessionId, entries])

  const appendFinal = useCallback((speaker: Speaker, text: string, turnOrder: number) => {
    const key = `${speaker}:${turnOrder}`
    const existing = turnIndexRef.current.get(key)
    let entryId = ''
    if (existing !== undefined) {
      const next = [...transcriptRef.current]
      entryId = next[existing].id
      next[existing] = { ...next[existing], text }
      transcriptRef.current = next
      setEntries(next)
    } else {
      const entry: TranscriptEntry = {
        id: `${speaker}-${turnOrder}-${Date.now()}`,
        speaker,
        text,
        timestamp: Date.now()
      }
      entryId = entry.id
      turnIndexRef.current.set(key, transcriptRef.current.length)
      transcriptRef.current = [...transcriptRef.current, entry]
      setEntries(transcriptRef.current)
    }
    if (speaker === 'me') setPartialMe('')
    else setPartialInterviewer('')

    if (speaker === 'interviewer') {
      const { source, display } = languageRef.current
      if (needsTranslation(source, display)) {
        const targetId = entryId
        void window.copilot
          .generateAnswer({
            task: 'translate',
            transcript: text,
            translateTo: languageLabel(display)
          })
          .then((translation) => {
            setEntries((prev) => {
              const next = prev.map((entry) =>
                entry.id === targetId ? { ...entry, translation } : entry
              )
              transcriptRef.current = next
              return next
            })
          })
          .catch(() => undefined)
      }
      if (autoTriggerRef.current && looksLikeQuestion(text)) {
        window.clearTimeout(autoTimerRef.current)
        autoTimerRef.current = window.setTimeout(() => {
          if (!answeringRef.current) void generateRef.current('answer')
        }, 1500)
      }
    }
  }, [])

  const patchActiveSession = useCallback(
    (patch: Partial<InterviewSession>) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === activeSessionId ? { ...session, ...patch, updatedAt: Date.now() } : session
        )
      )
    },
    [activeSessionId]
  )

  const applySession = useCallback((session: InterviewSession) => {
    setActiveSessionId(session.id)
    setSelectedPromptId(session.promptId)
    setEntries(session.entries)
    transcriptRef.current = session.entries
    turnIndexRef.current = new Map()
    setAnswer(session.answers.filter((item) => item.kind !== 'code' && item.kind !== 'debrief').at(-1)?.text || session.answers.at(-1)?.text || '')
    setCodeAnswer(session.codeAnswer || '')
    screenshotsRef.current = []
    setScreenshots([])
    setOverlayTab(session.mode === 'coding' || session.mode === 'oa' ? 'code' : 'answer')
    setAnswerError('')
    setPartialMe('')
    setPartialInterviewer('')
    setResumeFileName('')
    setError('')
    setPaused(false)
    setStatus(
      session.status === 'done'
        ? 'Ended'
        : session.status === 'paused'
          ? 'Paused'
          : session.status === 'live'
            ? 'Listening'
            : 'Idle'
    )
  }, [])

  const resetInterviewState = useCallback(() => {
    setActiveSessionId('')
    setEntries([])
    transcriptRef.current = []
    turnIndexRef.current = new Map()
    setAnswer('')
    setCodeAnswer('')
    screenshotsRef.current = []
    setScreenshots([])
    setOverlayTab('answer')
    setAnswerError('')
    setPartialMe('')
    setPartialInterviewer('')
    setResumeFileName('')
    setPaused(false)
    setStatus('Idle')
  }, [])

  const teardownSession = useCallback(async () => {
    const session = sessionRef.current
    sessionRef.current = null
    session?.sockets.forEach((s) => s.close())
    await Promise.all(session?.captures.map((c) => c.stop()) || [])
    setListening(false)
    setPartialMe('')
    setPartialInterviewer('')
  }, [])

  const pauseListening = useCallback(async () => {
    await teardownSession()
    setPaused(true)
    setStatus('Paused')
    patchActiveSession({ status: 'paused' })
  }, [patchActiveSession, teardownSession])

  const stopListening = useCallback(async () => {
    await teardownSession()
    setPaused(false)
    setStatus('Idle')
  }, [teardownSession])

  const endInterview = useCallback(async () => {
    await teardownSession()
    setPaused(false)
    setStatus('Ended')
    patchActiveSession({ status: 'done' })
    setTab('interviews')
    window.copilot.showSetup()
  }, [patchActiveSession, teardownSession])

  const selectSession = useCallback(
    async (id: string) => {
      if (id === activeSessionId) return
      if (listening) {
        setError('Pause or end the current interview before switching sessions.')
        return
      }
      if (paused) await stopListening()
      const next = sessions.find((session) => session.id === id)
      if (next) applySession(next)
    },
    [activeSessionId, applySession, listening, paused, sessions, stopListening]
  )

  const createInterview = useCallback(async () => {
    if (listening) {
      setError('Pause or end the current interview before opening a new one.')
      return
    }
    if (paused) await stopListening()
    const next = createSession(DEFAULT_PROMPT_ID)
    setSessions((prev) => [next, ...prev])
    applySession(next)
  }, [applySession, listening, paused, stopListening])

  const deleteInterview = useCallback(
    (id: string) => {
      if (listening) return
      const remaining = sessions.filter((session) => session.id !== id)
      setSessions(remaining)
      if (id !== activeSessionId) return
      if (remaining[0]) applySession(remaining[0])
      else resetInterviewState()
    },
    [activeSessionId, applySession, listening, resetInterviewState, sessions]
  )

  const clearAllInterviews = useCallback(async () => {
    if (listening) {
      setError('End the live interview before clearing history.')
      return
    }
    if (paused) await stopListening()
    setSessions([])
    resetInterviewState()
  }, [listening, paused, resetInterviewState, stopListening])

  const startListening = useCallback(async () => {
    if (sessionRef.current || startingRef.current) return
    setError('')
    setAnswerError('')
    if (!micId) {
      setError('Pick your microphone in Settings.')
      return
    }
    if (!activeSession) {
      setError('Create an interview first.')
      return
    }
    if (interviewerSource === 'device') {
      if (!loopbackId) {
        setError('Pick an interviewer microphone in Settings.')
        return
      }
      if (micId === loopbackId) {
        setError('Mic and interviewer devices must be different.')
        return
      }
    }

    startingRef.current = true
    try {
      setStatus('Connecting…')
      const [micToken, systemToken] = await Promise.all([
        window.copilot.getStreamingToken(),
        window.copilot.getStreamingToken()
      ])

      const micSocket = connectAssemblyAI(micToken, 'me', {
        onPartial: setPartialMe,
        onFinal: (text, turn) => appendFinal('me', text, turn),
        onError: (message) => setError(message)
      })
      const interviewerSocket = connectAssemblyAI(systemToken, 'interviewer', {
        onPartial: setPartialInterviewer,
        onFinal: (text, turn) => appendFinal('interviewer', text, turn),
        onError: (message) => setError(message)
      })

      try {
        const [micCapture, systemCapture] = await Promise.all([
          startPcmCapture(micId, (chunk) => micSocket.send(chunk)),
          interviewerSource === 'system'
            ? startSystemAudioCapture((chunk) => interviewerSocket.send(chunk))
            : startPcmCapture(loopbackId, (chunk) => interviewerSocket.send(chunk), { raw: true })
        ])

        sessionRef.current = {
          captures: [micCapture, systemCapture],
          sockets: [micSocket, interviewerSocket]
        }
        setPaused(false)
        setListening(true)
        setStatus('Listening')
        patchActiveSession({ status: 'live' })
        window.copilot.showOverlay()
      } catch (captureErr) {
        micSocket.close()
        interviewerSocket.close()
        throw captureErr
      }
    } catch (err) {
      setListening(false)
      setStatus(paused ? 'Paused' : 'Idle')
      setError(err instanceof Error ? err.message : 'Failed to start transcription')
    } finally {
      startingRef.current = false
    }
  }, [activeSession, appendFinal, interviewerSource, loopbackId, micId, paused, patchActiveSession])

  useEffect(() => {
    return () => {
      void stopListening()
    }
  }, [stopListening])

  const generateCopilot = useCallback(
    async (kind: 'answer' | 'code', quickPrompt?: string) => {
      if (answeringRef.current) return
      setAnswerError('')
      setAnswering(true)
      if (kind === 'code') {
        setOverlayTab('code')
        setCodeAnswer('')
      } else {
        setOverlayTab('answer')
        setAnswer('')
      }
      try {
        const transcriptText = transcriptRef.current
          .map((entry) => `${entry.speaker === 'interviewer' ? 'Interviewer' : 'Me'}: ${entry.text}`)
          .join('\n')
        const result = await window.copilot.generateAnswer({
          transcript: transcriptText,
          resume: activeSession?.resume || '',
          jobDescription: activeSession?.jobDescription || '',
          additionalInfo: activeSession?.additionalInfo || '',
          company: activeSession?.company || '',
          role: activeSession?.role || '',
          prompt: activePrompt?.body || '',
          customInstructions,
          mode: activeSession?.mode,
          responseStyle: activeSession?.responseStyle || 'bullets',
          quickPrompt,
          images: screenshotsRef.current,
          task: kind
        })
        if (kind === 'code') setCodeAnswer(result)
        else setAnswer(result)
        setSessions((prev) =>
          prev.map((session) =>
            session.id === activeSessionId
              ? {
                  ...session,
                  answers: [
                    ...session.answers,
                    { id: crypto.randomUUID(), text: result, createdAt: Date.now(), kind }
                  ],
                  codeAnswer: kind === 'code' ? result : session.codeAnswer,
                  updatedAt: Date.now()
                }
              : session
          )
        )
      } catch (err) {
        setAnswerError(err instanceof Error ? err.message : 'Failed to generate answer')
      } finally {
        setAnswering(false)
      }
    },
    [
      activePrompt?.body,
      activeSession?.company,
      activeSession?.additionalInfo,
      activeSession?.jobDescription,
      activeSession?.mode,
      activeSession?.responseStyle,
      activeSession?.resume,
      activeSession?.role,
      activeSessionId,
      customInstructions
    ]
  )

  const testPrompt = useCallback(
    async (sampleQuestion: string) => {
      const question = sampleQuestion.trim()
      if (!question || previewing) return
      setPreviewError('')
      setPreviewing(true)
      setPreviewAnswer('')
      try {
        const promptBody =
          prompts.find((prompt) => prompt.id === selectedPromptId)?.body || activePrompt?.body || ''
        const result = await window.copilot.generateAnswer({
          task: 'preview',
          transcript: `Interviewer: ${question}`,
          resume: activeSession?.resume || '',
          jobDescription: activeSession?.jobDescription || '',
          additionalInfo: activeSession?.additionalInfo || '',
          company: activeSession?.company || '',
          role: activeSession?.role || '',
          prompt: promptBody,
          customInstructions,
          mode: activeSession?.mode,
          responseStyle: activeSession?.responseStyle || 'bullets'
        })
        setPreviewAnswer(result)
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : 'Could not generate a preview.')
      } finally {
        setPreviewing(false)
      }
    },
    [
      activePrompt?.body,
      activeSession?.company,
      activeSession?.additionalInfo,
      activeSession?.jobDescription,
      activeSession?.mode,
      activeSession?.responseStyle,
      activeSession?.resume,
      activeSession?.role,
      customInstructions,
      previewing,
      prompts,
      selectedPromptId
    ]
  )

  const getAnswer = useCallback(
    async (quickPrompt?: string) => {
      await generateCopilot('answer', quickPrompt)
    },
    [generateCopilot]
  )

  useEffect(() => {
    generateRef.current = generateCopilot
  }, [generateCopilot])

  useEffect(
    () =>
      window.copilot.onAnswerToken((payload) => {
        if (payload.reset) {
          if (payload.kind === 'code') setCodeAnswer('')
          else if (payload.kind === 'preview') setPreviewAnswer('')
          else if (payload.kind === 'debrief') {
            setSessions((prev) =>
              prev.map((session) =>
                session.id === activeSessionId ? { ...session, debrief: '', updatedAt: Date.now() } : session
              )
            )
          } else if (payload.kind === 'answer') setAnswer('')
          return
        }
        if (!payload.token) return
        if (payload.kind === 'code') setCodeAnswer((current) => current + payload.token)
        else if (payload.kind === 'preview') setPreviewAnswer((current) => current + payload.token)
        else if (payload.kind === 'debrief') {
          setSessions((prev) =>
            prev.map((session) =>
              session.id === activeSessionId
                ? { ...session, debrief: `${session.debrief || ''}${payload.token}`, updatedAt: Date.now() }
                : session
            )
          )
        } else if (payload.kind === 'answer') setAnswer((current) => current + payload.token)
      }),
    [activeSessionId]
  )

  const captureScreenshot = useCallback(async (region = false) => {
    setError('')
    try {
      const image = await window.copilot.captureDisplay({ region })
      if (!image) return
      setScreenshots((prev) => {
        const next = [...prev, image].slice(-6)
        screenshotsRef.current = next
        return next
      })
      setOverlayTab('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not capture the display.')
    }
  }, [])

  const generateDebrief = useCallback(async () => {
    const transcriptText = transcriptRef.current
      .map((entry) => `${entry.speaker === 'interviewer' ? 'Interviewer' : 'Me'}: ${entry.text}`)
      .join('\n')
    if (!transcriptText.trim()) return
    setDebriefing(true)
    try {
      const result = await window.copilot.generateAnswer({
        task: 'debrief',
        transcript: transcriptText,
        resume: activeSession?.resume || '',
        jobDescription: activeSession?.jobDescription || '',
        additionalInfo: activeSession?.additionalInfo || '',
        company: activeSession?.company || '',
        role: activeSession?.role || ''
      })
      patchActiveSession({ debrief: result })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write a debrief.')
    } finally {
      setDebriefing(false)
    }
  }, [
    activeSession?.company,
    activeSession?.additionalInfo,
    activeSession?.jobDescription,
    activeSession?.resume,
    activeSession?.role,
    patchActiveSession
  ])

  const exportInterview = useCallback(async () => {
    if (!activeSession) return
    try {
      await window.copilot.exportMarkdown({
        markdown: formatSessionExport({
          ...activeSession,
          entries: transcriptRef.current,
          codeAnswer: codeAnswer || activeSession.codeAnswer
        }),
        fileName: `${sessionTitle(activeSession).replace(/[^\w.-]+/g, '-')}.md`
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export this interview.')
    }
  }, [activeSession, codeAnswer])

  const runSimulation = useCallback(
    async (reply?: string) => {
      if (listening) return
      setSimulating(true)
      setError('')
      try {
        if (reply?.trim()) {
          const entry: TranscriptEntry = {
            id: `me-sim-${Date.now()}`,
            speaker: 'me',
            text: reply.trim(),
            timestamp: Date.now()
          }
          transcriptRef.current = [...transcriptRef.current, entry]
          setEntries(transcriptRef.current)
        }
        const transcriptText = transcriptRef.current
          .map((entry) => `${entry.speaker === 'interviewer' ? 'Interviewer' : 'Me'}: ${entry.text}`)
          .join('\n')
        const question = await window.copilot.generateAnswer({
          task: 'simulate',
          transcript: transcriptText,
          resume: activeSession?.resume || '',
          jobDescription: activeSession?.jobDescription || '',
          additionalInfo: activeSession?.additionalInfo || '',
          company: activeSession?.company || '',
          role: activeSession?.role || ''
        })
        const entry: TranscriptEntry = {
          id: `interviewer-sim-${Date.now()}`,
          speaker: 'interviewer',
          text: question,
          timestamp: Date.now()
        }
        transcriptRef.current = [...transcriptRef.current, entry]
        setEntries(transcriptRef.current)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not continue the simulation.')
      } finally {
        setSimulating(false)
      }
    },
    [
      activeSession?.company,
      activeSession?.additionalInfo,
      activeSession?.jobDescription,
      activeSession?.resume,
      activeSession?.role,
      listening
    ]
  )

  const typedKeyFor = useCallback(
    (nextProvider: LlmProvider): string => {
      if (nextProvider === 'anthropic') return anthropicKey.trim()
      if (nextProvider === 'openrouter') return openrouterKey.trim()
      return openaiKey.trim()
    },
    [anthropicKey, openaiKey, openrouterKey]
  )

  const applyKeyStatus = useCallback((result: KeyStatus): void => {
    setKeyStatus(result)
    setProvider(result.provider)
    setModel(result.model)
    setVisionProvider(result.visionProvider)
    setVisionModel(result.visionModel)
  }, [])

  const persistCredentials = useCallback(
    (patch: {
      provider?: LlmProvider
      model?: string
      visionProvider?: LlmProvider
      visionModel?: string
    } = {}) =>
      window.copilot.saveCredentials({
        assemblyaiKey,
        openaiKey,
        anthropicKey,
        openrouterKey,
        provider: patch.provider ?? provider,
        model: patch.model ?? model,
        visionProvider: patch.visionProvider ?? visionProvider,
        visionModel: patch.visionModel ?? visionModel
      }),
    [
      anthropicKey,
      assemblyaiKey,
      model,
      openaiKey,
      openrouterKey,
      provider,
      visionModel,
      visionProvider
    ]
  )

  const clearTypedKeys = useCallback((): void => {
    setAssemblyaiKey('')
    setOpenaiKey('')
    setAnthropicKey('')
    setOpenrouterKey('')
  }, [])

  const loadModels = useCallback(
    async (nextProvider: LlmProvider) => {
      setLoadingProvider(nextProvider)
      setModelsLoading(true)
      setModelsError('')
      setCredentialsMessage('')
      try {
        const typedKey = typedKeyFor(nextProvider)
        const saved = await window.copilot.saveCredentials({
          assemblyaiKey,
          openaiKey,
          anthropicKey,
          openrouterKey
        })
        applyKeyStatus(saved)
        if (typedKey) clearTypedKeys()
        const list = await window.copilot.listModels({ provider: nextProvider })
        setModelsByProvider((prev) => ({ ...prev, [nextProvider]: list }))
        const nextModel =
          saved.provider === nextProvider && saved.model && !list.some((item) => item.id === saved.model)
            ? ''
            : saved.model
        const nextVisionModel =
          saved.visionProvider === nextProvider &&
          saved.visionModel &&
          !list.some((item) => item.id === saved.visionModel)
            ? ''
            : saved.visionModel
        if (nextModel !== saved.model || nextVisionModel !== saved.visionModel) {
          applyKeyStatus(
            await window.copilot.saveCredentials({
              provider: saved.provider,
              model: nextModel,
              visionProvider: saved.visionProvider,
              visionModel: nextVisionModel
            })
          )
        }
        setCredentialsMessage(
          typedKey
            ? `${LLM_PROVIDERS.find((item) => item.id === nextProvider)?.label} key saved. Choose models below.`
            : `Loaded ${list.length} ${LLM_PROVIDERS.find((item) => item.id === nextProvider)?.label} models.`
        )
      } catch (err) {
        setModelsByProvider((prev) => ({ ...prev, [nextProvider]: [] }))
        setModelsError(err instanceof Error ? err.message : 'Could not load models.')
      } finally {
        setModelsLoading(false)
        setLoadingProvider(null)
      }
    },
    [anthropicKey, applyKeyStatus, assemblyaiKey, clearTypedKeys, openaiKey, openrouterKey, typedKeyFor]
  )

  const ensureProviderModels = useCallback(
    async (nextProvider: LlmProvider) => {
      if (modelsByProvider[nextProvider]?.length) return
      if (keyStatus[nextProvider] || typedKeyFor(nextProvider)) {
        await loadModels(nextProvider)
      }
    },
    [keyStatus, loadModels, modelsByProvider, typedKeyFor]
  )

  const changeProvider = useCallback(
    async (nextProvider: LlmProvider) => {
      if (nextProvider === provider) {
        await ensureProviderModels(nextProvider)
        return
      }
      applyKeyStatus(
        await persistCredentials({
          provider: nextProvider,
          model: modelsByProvider[nextProvider]?.some((item) => item.id === model) ? model : ''
        })
      )
      await ensureProviderModels(nextProvider)
    },
    [applyKeyStatus, ensureProviderModels, model, modelsByProvider, persistCredentials, provider]
  )

  const changeVisionProvider = useCallback(
    async (nextProvider: LlmProvider) => {
      if (nextProvider === visionProvider) {
        await ensureProviderModels(nextProvider)
        return
      }
      applyKeyStatus(
        await persistCredentials({
          visionProvider: nextProvider,
          visionModel: modelsByProvider[nextProvider]?.some((item) => item.id === visionModel)
            ? visionModel
            : ''
        })
      )
      await ensureProviderModels(nextProvider)
    },
    [
      applyKeyStatus,
      ensureProviderModels,
      modelsByProvider,
      persistCredentials,
      visionModel,
      visionProvider
    ]
  )

  const selectModel = useCallback(
    async (nextModel: string) => {
      setModel(nextModel)
      applyKeyStatus(await persistCredentials({ model: nextModel }))
      if (assemblyaiKey || openaiKey || anthropicKey || openrouterKey) clearTypedKeys()
    },
    [
      anthropicKey,
      applyKeyStatus,
      assemblyaiKey,
      clearTypedKeys,
      openaiKey,
      openrouterKey,
      persistCredentials
    ]
  )

  const selectVisionModel = useCallback(
    async (nextModel: string) => {
      setVisionModel(nextModel)
      applyKeyStatus(await persistCredentials({ visionModel: nextModel }))
      if (assemblyaiKey || openaiKey || anthropicKey || openrouterKey) clearTypedKeys()
    },
    [
      anthropicKey,
      applyKeyStatus,
      assemblyaiKey,
      clearTypedKeys,
      openaiKey,
      openrouterKey,
      persistCredentials
    ]
  )

  const saveApiCredentials = useCallback(async () => {
    setSavingCredentials(true)
    setCredentialsMessage('')
    try {
      applyKeyStatus(await persistCredentials())
      clearTypedKeys()
      setCredentialsMessage('API configuration saved securely.')
      setConnectionTest(null)
    } catch (err) {
      setCredentialsMessage(err instanceof Error ? err.message : 'Could not save API configuration.')
    } finally {
      setSavingCredentials(false)
    }
  }, [applyKeyStatus, clearTypedKeys, persistCredentials])

  const testApiConnections = useCallback(async () => {
    setTestingConnections(true)
    setConnectionTest(null)
    setCredentialsMessage('')
    try {
      applyKeyStatus(await persistCredentials())
      clearTypedKeys()
      setConnectionTest(await window.copilot.testConnections())
      setCredentialsMessage('API configuration saved and tested.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed.'
      setConnectionTest({
        assemblyai: { ok: false, message },
        openai: { ok: false, message },
        anthropic: { ok: false, message },
        openrouter: { ok: false, message }
      })
    } finally {
      setTestingConnections(false)
    }
  }, [applyKeyStatus, clearTypedKeys, persistCredentials])

  const importResume = useCallback(async () => {
    setImportingResume(true)
    setError('')
    try {
      const result = await window.copilot.importResume()
      if (result) {
        patchActiveSession({ resume: result.text })
        setResumeFileName(result.fileName)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this resume.')
    } finally {
      setImportingResume(false)
    }
  }, [patchActiveSession])

  const patchPrompt = useCallback(
    (patch: Partial<PromptTemplate>) => {
      setPrompts((prev) =>
        prev.map((prompt) => (prompt.id === selectedPromptId ? { ...prompt, ...patch } : prompt))
      )
    },
    [selectedPromptId]
  )

  const createPrompt = useCallback(() => {
    const source = prompts.find((prompt) => prompt.id === selectedPromptId)
    const prompt: PromptTemplate = {
      id: crypto.randomUUID(),
      name: 'Custom prompt',
      body: source?.body || '',
      updatedAt: Date.now()
    }
    setPrompts((prev) => [...prev, prompt])
    setSelectedPromptId(prompt.id)
  }, [prompts, selectedPromptId])

  const duplicatePrompt = useCallback(() => {
    const source = prompts.find((prompt) => prompt.id === selectedPromptId)
    if (!source) return
    const prompt: PromptTemplate = {
      id: crypto.randomUUID(),
      name: `${source.name} copy`,
      body: source.body,
      updatedAt: Date.now()
    }
    setPrompts((prev) => [...prev, prompt])
    setSelectedPromptId(prompt.id)
  }, [prompts, selectedPromptId])

  const deletePrompt = useCallback(() => {
    if (selectedPromptId === DEFAULT_PROMPT_ID) return
    setPrompts((prev) => prev.filter((prompt) => prompt.id !== selectedPromptId))
    setSessions((prev) =>
      prev.map((session) =>
        session.promptId === selectedPromptId
          ? { ...session, promptId: DEFAULT_PROMPT_ID, updatedAt: Date.now() }
          : session
      )
    )
    setSelectedPromptId(DEFAULT_PROMPT_ID)
  }, [selectedPromptId])

  useEffect(() => {
    window.copilot.publishOverlayState({
      listening,
      paused,
      answering,
      status,
      error,
      answerError,
      answer,
      entries,
      partialMe,
      partialInterviewer,
      sessionLabel: activeSession ? sessionTitle(activeSession) : 'Interview Copilot',
      answerProvider: providerLabel,
      answerModel: keyStatus.model,
      visionModel: keyStatus.visionModel || keyStatus.model,
      mode: sessionMode,
      responseStyle: activeSession?.responseStyle,
      autoTrigger: Boolean(activeSession?.autoTrigger),
      screenshotCount: screenshots.length,
      codeAnswer,
      overlayTab
    })
  }, [
    activeSession,
    answer,
    answerError,
    answering,
    codeAnswer,
    entries,
    error,
    listening,
    overlayTab,
    paused,
    partialInterviewer,
    partialMe,
    providerLabel,
    keyStatus.model,
    keyStatus.visionModel,
    screenshots.length,
    sessionMode,
    status
  ])

  useEffect(
    () =>
      window.copilot.onOverlayAction((action, payload) => {
        if (action === 'stop') void pauseListening()
        if (action === 'resume') void startListening()
        if (action === 'answer') void getAnswer(payload)
        if (action === 'end') {
          void endInterview().then(() => {
            if (transcriptRef.current.length > 0) void generateDebrief()
          })
        }
        if (action === 'toggleAuto') {
          patchActiveSession({ autoTrigger: !autoTriggerRef.current })
        }
        if (action === 'capture') void captureScreenshot()
        if (action === 'captureRegion') void captureScreenshot(true)
        if (action === 'clearCaptures') {
          screenshotsRef.current = []
          setScreenshots([])
        }
        if (action === 'solve') void generateCopilot('code', payload)
        if (action === 'simulate') void runSimulation(payload)
        if (action === 'debrief') void generateDebrief()
        if (action === 'export') void exportInterview()
      }),
    [
      captureScreenshot,
      endInterview,
      exportInterview,
      generateCopilot,
      generateDebrief,
      getAnswer,
      pauseListening,
      patchActiveSession,
      runSimulation,
      startListening
    ]
  )

  const missingKeys = useMemo(() => {
    const missing: string[] = []
    if (!keyStatus.assemblyai) missing.push('AssemblyAI')
    const selectedProvider = LLM_PROVIDERS.find((item) => item.id === keyStatus.provider)
    if (!keyStatus[keyStatus.provider]) {
      missing.push(selectedProvider?.label || 'answer provider')
    } else if (!keyStatus.model) {
      missing.push('answer model')
    }
    return missing
  }, [keyStatus])
  const handleTabKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (currentIndex < 0) return
    event.preventDefault()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length]
    nextTab?.click()
    nextTab?.focus()
  }

  const showSessionDock = tab === 'interviews'

  return (
    <div className="app setup-app">
      <aside className="setup-nav">
        <div className="brand-lockup">
          <span className="brand-mark">
            <img src={brandMark} alt="" />
          </span>
          <div className="brand-copy">
            <h1>Interview Copilot</h1>
            <p>Prepare clearly. Answer confidently.</p>
          </div>
        </div>
        <nav
          className="setup-nav-items"
          role="tablist"
          aria-label="Setup sections"
          aria-orientation="vertical"
          onKeyDown={handleTabKeyDown}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'dashboard'}
            aria-controls="dashboard-panel"
            tabIndex={tab === 'dashboard' ? 0 : -1}
            className={tab === 'dashboard' ? 'active' : ''}
            onClick={() => setTab('dashboard')}
          >
            <Icon name="home" />
            Dashboard
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'interviews'}
            aria-controls="interviews-panel"
            tabIndex={tab === 'interviews' ? 0 : -1}
            className={tab === 'interviews' ? 'active' : ''}
            onClick={() => setTab('interviews')}
          >
            <Icon name="interview" />
            Interviews
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'prompts'}
            aria-controls="prompts-panel"
            tabIndex={tab === 'prompts' ? 0 : -1}
            className={tab === 'prompts' ? 'active' : ''}
            onClick={() => setTab('prompts')}
          >
            <Icon name="prompt" />
            Prompts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'settings'}
            aria-controls="settings-panel"
            tabIndex={tab === 'settings' ? 0 : -1}
            className={tab === 'settings' ? 'active' : ''}
            onClick={() => setTab('settings')}
          >
            <Icon name="settings" />
            Settings
          </button>
        </nav>

        <div
          className={`status-pill ${listening ? 'live' : paused ? 'paused' : status === 'Ended' ? 'ended' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className={`dot ${listening ? 'live' : paused ? 'paused' : status === 'Ended' ? 'ended' : ''}`} />
          {status}
        </div>

        <section className="nav-readiness" aria-labelledby="readiness-title">
          <div className="nav-readiness-head">
            <h2 className="panel-title" id="readiness-title">Readiness</h2>
            <span className={`status-badge ${missingKeys.length === 0 && micId ? 'live' : 'paused'}`}>
              {missingKeys.length === 0 && micId ? 'Ready' : 'Setup'}
            </span>
          </div>
          <div className="summary-list">
            <button className="readiness-row" type="button" onClick={() => setTab('settings')}>
              <span className="readiness-label"><Icon name="audio" />Transcription</span>
              <span className={`readiness-value ${keyStatus.assemblyai ? 'ready' : 'missing'}`}>
                {keyStatus.assemblyai ? 'Ready' : 'Add key'}
              </span>
            </button>
            <button className="readiness-row" type="button" onClick={() => setTab('settings')}>
              <span className="readiness-label"><Icon name="sparkles" />Answer</span>
              <span className={`readiness-value ${isAnswerReady ? 'ready' : 'missing'}`} title={keyStatus.model}>
                {keyStatus.model || 'Choose'}
              </span>
            </button>
            <button className="readiness-row" type="button" onClick={() => setTab('settings')}>
              <span className="readiness-label"><Icon name="camera" />Vision</span>
              <span
                className={`readiness-value ${isVisionReady ? 'ready' : keyStatus.model ? '' : 'missing'}`}
                title={keyStatus.visionModel || 'Solve will use the answer model'}
              >
                {keyStatus.visionModel || (keyStatus.model ? 'Uses answer' : 'Choose')}
              </span>
            </button>
            <button className="readiness-row" type="button" onClick={() => setTab('settings')}>
              <span className="readiness-label"><Icon name="audio" />Mic</span>
              <span className={`readiness-value ${micId ? 'ready' : 'missing'}`}>
                {micId ? 'Selected' : 'Choose'}
              </span>
            </button>
          </div>
        </section>

        <div className="setup-actions">
          <ControlBar
            listening={listening}
            paused={paused}
            answering={answering}
            canAnswer={(entries.length > 0 && isAnswerReady) || (screenshots.length > 0 && isSolveReady)}
            canStart={
              missingKeys.length === 0 &&
              Boolean(micId) &&
              Boolean(activeSession) &&
              (interviewerSource !== 'device' || Boolean(loopbackId))
            }
            onStart={() => void startListening()}
            onPause={() => void pauseListening()}
            onEnd={() => {
              void endInterview().then(() => {
                if (transcriptRef.current.length > 0) void generateDebrief()
              })
            }}
            canEnd={listening || paused}
            onAnswer={() => void getAnswer()}
            onSecondary={() => window.copilot.showOverlay()}
            secondaryLabel="Open mini overlay"
            secondaryIcon="answer"
            compact
          />
        </div>
      </aside>

      <div className={`setup-shell${showSessionDock ? ' has-dock' : ''}`}>
        {missingKeys.length > 0 ? (
          <button className="banner" type="button" onClick={() => setTab('settings')}>
            <Icon name="settings" />
            Finish setup: {missingKeys.join(', ')}
            <Icon name="chevron" />
          </button>
        ) : null}
        {error ? <p className="banner error" role="alert">{error}</p> : null}

        <main className="setup-layout">
          <div className="setup-main">
            <div id="dashboard-panel" role="tabpanel" hidden={tab !== 'dashboard'}>
              <DashboardPanel
                sessions={sessions}
                ready={missingKeys.length === 0 && Boolean(micId) && Boolean(activeSession)}
                missingSetup={missingKeys}
                transcribeReady={keyStatus.assemblyai}
                answerReady={isAnswerReady}
                micReady={Boolean(micId)}
                listening={listening}
                canStart={
                  missingKeys.length === 0 &&
                  Boolean(micId) &&
                  Boolean(activeSession) &&
                  (interviewerSource !== 'device' || Boolean(loopbackId))
                }
                onCreate={() => {
                  void createInterview()
                  setTab('interviews')
                }}
                onOpenInterviews={() => setTab('interviews')}
                onOpenSettings={() => setTab('settings')}
                onSelectSession={(id) => {
                  void selectSession(id)
                  setTab('interviews')
                }}
                onStart={() => void startListening()}
                onOpenOverlay={() => window.copilot.showOverlay()}
              />
            </div>
            <div id="interviews-panel" role="tabpanel" hidden={tab !== 'interviews'}>
              <SessionsPanel
                sessions={sessions}
                prompts={prompts}
                activeSessionId={activeSessionId}
                importingResume={importingResume}
                resumeFileName={resumeFileName}
                listening={listening}
                paused={paused}
                onSelect={(id) => void selectSession(id)}
                onCreate={() => void createInterview()}
                onDelete={deleteInterview}
                onClearAll={() => void clearAllInterviews()}
                onChange={(patch) => {
                  patchActiveSession(patch)
                  if (patch.promptId) setSelectedPromptId(patch.promptId)
                }}
                onImportResume={() => void importResume()}
                onMarkDone={() => {
                  if (listening || paused) {
                    void endInterview().then(() => {
                      if (transcriptRef.current.length > 0) void generateDebrief()
                    })
                  } else patchActiveSession({ status: 'done' })
                }}
                onExport={() => void exportInterview()}
                onDebrief={() => void generateDebrief()}
                onSimulate={(reply) => void runSimulation(reply)}
                debriefing={debriefing}
                simulating={simulating}
              />
            </div>

            <div id="prompts-panel" role="tabpanel" hidden={tab !== 'prompts'}>
              <PromptsPanel
                prompts={prompts}
                selectedId={selectedPromptId}
                instructions={customInstructions}
                sessionLabel={activeSession ? sessionTitle(activeSession) : ''}
                canPreview={isAnswerReady}
                previewing={previewing}
                previewAnswer={previewAnswer}
                previewError={previewError}
                onSelect={setSelectedPromptId}
                onChange={patchPrompt}
                onInstructionsChange={setCustomInstructions}
                onCreate={createPrompt}
                onDuplicate={duplicatePrompt}
                onDelete={deletePrompt}
                onPreview={(question) => void testPrompt(question)}
              />
            </div>

            <div id="settings-panel" role="tabpanel" hidden={tab !== 'settings'}>
              <SettingsPanel
                devices={devices}
                micId={micId}
                loopbackId={loopbackId}
                interviewerSource={interviewerSource}
                assemblyaiKey={assemblyaiKey}
                openaiKey={openaiKey}
                anthropicKey={anthropicKey}
                openrouterKey={openrouterKey}
                keyStatus={keyStatus}
                provider={provider}
                model={model}
                models={models}
                visionProvider={visionProvider}
                visionModel={visionModel}
                visionModels={visionModels}
                modelsLoading={modelsLoading}
                modelsError={modelsError}
                loadingProvider={loadingProvider}
                savingCredentials={savingCredentials}
                credentialsMessage={credentialsMessage}
                testingConnections={testingConnections}
                connectionTest={connectionTest}
                onMicChange={setMicId}
                onLoopbackChange={setLoopbackId}
                onInterviewerSourceChange={setInterviewerSource}
                onAssemblyaiKeyChange={setAssemblyaiKey}
                onOpenaiKeyChange={setOpenaiKey}
                onAnthropicKeyChange={setAnthropicKey}
                onOpenrouterKeyChange={setOpenrouterKey}
                onProviderChange={(next) => void changeProvider(next)}
                onModelChange={(next) => void selectModel(next)}
                onVisionProviderChange={(next) => void changeVisionProvider(next)}
                onVisionModelChange={(next) => void selectVisionModel(next)}
                onLoadModels={(next) => void loadModels(next)}
                onSaveCredentials={() => void saveApiCredentials()}
                onTestConnections={() => void testApiConnections()}
                onRefreshDevices={() => void refreshDevices()}
              />
            </div>
          </div>

          {showSessionDock ? (
            <aside className="setup-sidebar">
              {entries.length > 0 || screenshots.length > 0 || codeAnswer ? (
                <section className="setup-session-preview">
                  <TranscriptPanel
                    entries={entries}
                    partialMe={partialMe}
                    partialInterviewer={partialInterviewer}
                    variant="setup"
                  />
                  {isCodingMode || screenshots.length > 0 || codeAnswer ? (
                    <CodePanel
                      code={codeAnswer}
                      answering={answering}
                      screenshotCount={screenshots.length}
                      canSolve={entries.length > 0 && isSolveReady}
                      error={answerError}
                      onCapture={() => void captureScreenshot()}
                      onSelectArea={() => void captureScreenshot(true)}
                      onClear={() => {
                        screenshotsRef.current = []
                        setScreenshots([])
                      }}
                      onSolve={() => void generateCopilot('code')}
                    />
                  ) : (
                    <AnswerPanel
                      answer={answer}
                      answering={answering}
                      error={answerError}
                      onRetry={() => void getAnswer()}
                    />
                  )}
                </section>
              ) : (
                <div className="setup-tip empty-state">
                  <Icon name="audio" size={22} />
                  <p>Start a session to capture the conversation. Ctrl/Cmd+Shift+Space gets an answer.</p>
                </div>
              )}
            </aside>
          ) : null}
        </main>
      </div>
    </div>
  )
}
