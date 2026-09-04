import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import AnswerPanel from './components/AnswerPanel'
import CodePanel from './components/CodePanel'
import TranscriptPanel from './components/TranscriptPanel'
import ControlBar from './components/ControlBar'
import Icon from './components/Icon'
import type { InterviewMode, TranscriptEntry } from './types'
import { INTERVIEW_MODES } from './types'
import brandMark from './assets/brand-mark.png'

type OverlayState = {
  listening: boolean
  paused: boolean
  answering: boolean
  status: string
  error: string
  answerError: string
  answer: string
  entries: TranscriptEntry[]
  partialMe: string
  partialInterviewer: string
  sessionLabel?: string
  answerProvider?: string
  answerModel?: string
  visionModel?: string
  mode?: InterviewMode | string
  responseStyle?: string
  autoTrigger?: boolean
  screenshotCount?: number
  codeAnswer?: string
  overlayTab?: 'answer' | 'code'
}

const INITIAL_STATE: OverlayState = {
  listening: false,
  paused: false,
  answering: false,
  status: 'Preparing session…',
  error: '',
  answerError: '',
  answer: '',
  entries: [],
  partialMe: '',
  partialInterviewer: '',
  sessionLabel: '',
  answerProvider: '',
  answerModel: '',
  visionModel: '',
  mode: 'behavioral',
  autoTrigger: false,
  screenshotCount: 0,
  codeAnswer: '',
  overlayTab: 'answer'
}

export default function OverlayApp() {
  const [state, setState] = useState<OverlayState>(INITIAL_STATE)
  const [quickPrompt, setQuickPrompt] = useState('')
  const [tab, setTab] = useState<'answer' | 'code'>('answer')

  useEffect(() => window.copilot.onOverlayState(setState), [])
  useEffect(() => {
    if (state.overlayTab) setTab(state.overlayTab)
  }, [state.overlayTab])

  const codingMode = state.mode === 'coding' || state.mode === 'oa'
  const activeTab = codingMode && tab === 'answer' && !state.answer && (state.screenshotCount || 0) > 0 ? 'code' : tab
  const modeLabel = INTERVIEW_MODES.find((item) => item.id === state.mode)?.label || 'Interview'

  const submitQuickPrompt = (event?: FormEvent): void => {
    event?.preventDefault()
    window.copilot.sendOverlayAction('answer', quickPrompt.trim() || undefined)
    setQuickPrompt('')
  }

  const onQuickKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitQuickPrompt()
    }
  }

  return (
    <div className={`app overlay-app${activeTab === 'code' ? ' overlay-code' : ''}`}>
      <header className="titlebar">
        <div className="title">
          <span className="overlay-brand"><img src={brandMark} alt="" /></span>
          <span>
            Interview Copilot
            {state.sessionLabel ? (
              <span className="session-chip" title={state.sessionLabel}>{state.sessionLabel}</span>
            ) : null}
          </span>
        </div>
        <div className="window-actions">
          <button
            type="button"
            aria-label="Minimize overlay"
            title="Minimize overlay"
            onClick={() => window.copilot.minimize()}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            className="close"
            aria-label="Close overlay and return to setup"
            title="Close overlay and return to setup"
            onClick={() => window.copilot.close()}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </header>

      <div className="status-row" role="status" aria-live="polite">
        <span className="status-row-main">
          <span className={`dot ${state.listening ? 'live' : state.paused ? 'paused' : state.status === 'Ended' ? 'ended' : ''}`} />
          {state.listening ? 'Listening' : state.paused ? 'Paused' : state.status}
        </span>
        <button
          type="button"
          className={`auto-toggle ${state.autoTrigger ? 'on' : ''}`}
          onClick={() => window.copilot.sendOverlayAction('toggleAuto')}
          title="Auto-generate when the interviewer asks a question"
        >
          {state.autoTrigger ? 'Auto on' : 'Manual'}
        </button>
        <span className="model-chip" title={activeTab === 'code' ? state.visionModel || state.answerModel : state.answerModel}>
          {modeLabel}
        </span>
      </div>

      {state.error ? <p className="banner error" role="alert">{state.error}</p> : null}

      <ControlBar
        listening={state.listening}
        paused={state.paused}
        answering={state.answering}
        canAnswer={state.entries.length > 0 || Boolean(quickPrompt.trim()) || (state.screenshotCount || 0) > 0}
        canStart={state.paused}
        onStart={() => window.copilot.sendOverlayAction('resume')}
        onPause={() => window.copilot.sendOverlayAction('stop')}
        onEnd={() => window.copilot.sendOverlayAction('end')}
        canEnd={state.listening || state.paused}
        onAnswer={() => window.copilot.sendOverlayAction('answer', quickPrompt.trim() || undefined)}
        onSecondary={() => window.copilot.sendOverlayAction('showSetup')}
        secondaryLabel="Open setup"
        compact
      />

      <form className="quick-prompt" onSubmit={submitQuickPrompt}>
        <input
          value={quickPrompt}
          onChange={(event) => setQuickPrompt(event.target.value)}
          onKeyDown={onQuickKey}
          placeholder="Quick prompt if a word was missed…"
          aria-label="Quick prompt"
        />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={state.answering}>
          Hint
        </button>
      </form>

      <div className="overlay-tabs" role="tablist" aria-label="Overlay panels">
        <button
          type="button"
          role="tab"
          className={activeTab === 'answer' ? 'active' : ''}
          aria-selected={activeTab === 'answer'}
          onClick={() => setTab('answer')}
        >
          Answer
        </button>
        <button
          type="button"
          role="tab"
          className={activeTab === 'code' ? 'active' : ''}
          aria-selected={activeTab === 'code'}
          onClick={() => setTab('code')}
        >
          Code {state.screenshotCount ? `(${state.screenshotCount})` : ''}
        </button>
      </div>

      {activeTab === 'code' ? (
        <CodePanel
          code={state.codeAnswer || ''}
          answering={state.answering}
          screenshotCount={state.screenshotCount || 0}
          canSolve={state.entries.length > 0}
          error={state.answerError}
          onCapture={() => window.copilot.sendOverlayAction('capture')}
          onSelectArea={() => window.copilot.sendOverlayAction('captureRegion')}
          onClear={() => window.copilot.sendOverlayAction('clearCaptures')}
          onSolve={() => window.copilot.sendOverlayAction('solve', quickPrompt.trim() || undefined)}
        />
      ) : (
        <AnswerPanel
          answer={state.answer}
          answering={state.answering}
          error={state.answerError}
          onRetry={() => window.copilot.sendOverlayAction('answer')}
        />
      )}
      <TranscriptPanel
        entries={state.entries}
        partialMe={state.partialMe}
        partialInterviewer={state.partialInterviewer}
        variant="overlay"
      />
    </div>
  )
}
