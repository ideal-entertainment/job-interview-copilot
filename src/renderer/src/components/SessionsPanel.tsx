import { useState } from 'react'
import type { InterviewMode, InterviewSession, PromptTemplate, ResponseStyle } from '../types'
import { INTERVIEW_MODES, RESPONSE_STYLES, SESSION_LANGUAGES } from '../types'
import { formatSessionDuration, formatSessionTime, formatTranscriptText, sessionTitle, todayKey } from '../lib/workspace'
import Icon from './Icon'
import emptyArt from '../assets/empty-interviews.png'

type SessionsPanelProps = {
  sessions: InterviewSession[]
  prompts: PromptTemplate[]
  activeSessionId: string
  importingResume: boolean
  resumeFileName: string
  listening: boolean
  paused?: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onClearAll?: () => void
  onChange: (patch: Partial<InterviewSession>) => void
  onImportResume: () => void
  onMarkDone: () => void
  onExport?: () => void
  onDebrief?: () => void
  onSimulate?: (reply?: string) => void
  debriefing?: boolean
  simulating?: boolean
}

function compareByDateDesc(a: InterviewSession, b: InterviewSession): number {
  const byScheduled = (b.scheduledAt || '').localeCompare(a.scheduledAt || '')
  if (byScheduled !== 0) return byScheduled
  return (b.createdAt || 0) - (a.createdAt || 0)
}

function compareByDateAsc(a: InterviewSession, b: InterviewSession): number {
  return compareByDateDesc(b, a)
}

function groupSessions(sessions: InterviewSession[]): Array<{ label: string; items: InterviewSession[] }> {
  const today = todayKey()
  const groups = {
    today: [] as InterviewSession[],
    upcoming: [] as InterviewSession[],
    past: [] as InterviewSession[]
  }

  for (const session of sessions) {
    const day = (session.scheduledAt || '').slice(0, 10)
    if (session.status === 'done' && day < today) groups.past.push(session)
    else if (day === today || session.status === 'live' || session.status === 'paused') groups.today.push(session)
    else if (day > today) groups.upcoming.push(session)
    else groups.past.push(session)
  }

  groups.today.sort(compareByDateDesc)
  groups.upcoming.sort(compareByDateAsc)
  groups.past.sort(compareByDateDesc)

  return [
    { label: 'Today', items: groups.today },
    { label: 'Upcoming', items: groups.upcoming },
    { label: 'Past', items: groups.past }
  ].filter((group) => group.items.length > 0)
}

export default function SessionsPanel({
  sessions,
  prompts,
  activeSessionId,
  importingResume,
  resumeFileName,
  listening,
  paused = false,
  onSelect,
  onCreate,
  onDelete,
  onClearAll,
  onChange,
  onImportResume,
  onMarkDone,
  onExport,
  onDebrief,
  onSimulate,
  debriefing = false,
  simulating = false
}: SessionsPanelProps) {
  const active = sessions.find((session) => session.id === activeSessionId) || sessions[0]
  const activePrompt = prompts.find((prompt) => prompt.id === active?.promptId)
  const [copiedTranscript, setCopiedTranscript] = useState(false)
  const [simulateReply, setSimulateReply] = useState('')

  const copyTranscript = async (): Promise<void> => {
    if (!active?.entries.length) return
    await navigator.clipboard.writeText(formatTranscriptText(active.entries))
    setCopiedTranscript(true)
    window.setTimeout(() => setCopiedTranscript(false), 1600)
  }

  if (!active) {
    return (
      <section className="panel manager-panel">
        <div className="panel-header">
          <div className="panel-heading">
            <span className="panel-heading-icon"><Icon name="interview" /></span>
            <div>
              <h2 className="panel-title">Interviews</h2>
              <p className="panel-description">Prepare context for each interview before going live.</p>
            </div>
          </div>
        </div>
        <div className="panel-body empty-state">
          <img src={emptyArt} alt="" className="empty-illustration" />
          <p>No interviews yet. Create one to add a resume and job description.</p>
          <button type="button" className="btn btn-start" onClick={onCreate}>
            <Icon name="interview" />
            New interview
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="panel manager-panel" aria-labelledby="interviews-title">
      <div className="panel-header">
        <div className="panel-heading">
          <span className="panel-heading-icon"><Icon name="interview" /></span>
          <div>
            <h2 className="panel-title" id="interviews-title">Interviews</h2>
            <p className="panel-description">Keep every interview’s context, prompt, and transcript together.</p>
          </div>
        </div>
        <span className="status-badge">{sessions.length} total</span>
      </div>
      <div className="panel-body manager-body">
        <aside className="manager-list" aria-label="Interview list">
          <button type="button" className="btn btn-start" onClick={onCreate}>
            <Icon name="interview" />
            New interview
          </button>
          {sessions.length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-clear-history"
              disabled={listening}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete all ${sessions.length} interview${sessions.length === 1 ? '' : 's'}? Transcripts, answers, and recaps will be removed.`
                  )
                ) {
                  onClearAll?.()
                }
              }}
            >
              <Icon name="close" />
              Clear all history
            </button>
          ) : null}
          {groupSessions(sessions).map((group) => (
            <div key={group.label} className="manager-group">
              <div className="manager-group-title">{group.label}</div>
              {group.items.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`manager-item ${session.id === active.id ? 'active' : ''}`}
                  onClick={() => onSelect(session.id)}
                  disabled={listening && session.id !== active.id}
                  title={
                    listening && session.id !== active.id
                      ? 'Pause or end the live interview before switching'
                      : sessionTitle(session)
                  }
                >
                  <strong>{sessionTitle(session)}</strong>
                  <span>
                    {formatSessionTime(session.scheduledAt)}
                  </span>
                  <span className={`status-badge ${session.status}`}>{session.status}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        <div className="manager-editor" aria-label={`Edit ${sessionTitle(active)}`}>
          {listening ? (
            <p className="banner" role="status">
              This interview is live. Pause or end it before switching sessions.
            </p>
          ) : null}
          <div className="editor-section">
            <div className="editor-section-title">
              Interview details
              <span className={`status-badge ${active.status}`}>{active.status}</span>
            </div>
            <div className="session-fields">
              <label>
                Company
                <input
                  type="text"
                  value={active.company}
                  onChange={(e) => onChange({ company: e.target.value })}
                  placeholder="Acme"
                />
              </label>
              <label>
                Role
                <input
                  type="text"
                  value={active.role}
                  onChange={(e) => onChange({ role: e.target.value })}
                  placeholder="Staff engineer"
                />
              </label>
              <label>
                Date & time
                <input
                  type="datetime-local"
                  value={active.scheduledAt}
                  onChange={(e) => onChange({ scheduledAt: e.target.value })}
                />
              </label>
              <label>
                Answer prompt
                <select
                  value={active.promptId}
                  onChange={(e) => onChange({ promptId: e.target.value })}
                >
                  {prompts.map((prompt) => (
                    <option key={prompt.id} value={prompt.id}>
                      {prompt.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Interview mode
                <select
                  value={active.mode || 'behavioral'}
                  onChange={(e) => {
                    const mode = e.target.value as InterviewMode
                    const preset = INTERVIEW_MODES.find((item) => item.id === mode)
                    const currentIsBuiltIn = prompts.find((prompt) => prompt.id === active.promptId)?.builtIn
                    onChange(
                      currentIsBuiltIn && preset
                        ? { mode, promptId: preset.promptId }
                        : { mode }
                    )
                  }}
                >
                  {INTERVIEW_MODES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Answer style
                <select
                  value={active.responseStyle || 'bullets'}
                  onChange={(e) => onChange({ responseStyle: e.target.value as ResponseStyle })}
                >
                  {RESPONSE_STYLES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Spoken language
                <select
                  value={active.sourceLanguage || 'auto'}
                  onChange={(e) => onChange({ sourceLanguage: e.target.value })}
                >
                  {SESSION_LANGUAGES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Show transcript in
                <select
                  value={active.displayLanguage || 'en'}
                  onChange={(e) => onChange({ displayLanguage: e.target.value })}
                >
                  {SESSION_LANGUAGES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="hint">
              This interview currently uses <strong>{activePrompt?.name || 'the default prompt'}</strong>
              {' '}in <strong>{INTERVIEW_MODES.find((item) => item.id === active.mode)?.label || 'Behavioral'}</strong> mode.
              Auto-answer and coding capture live in the overlay. Get answer shortcut: Ctrl/Cmd+Shift+Space.
            </p>
          </div>

          <div className="editor-section">
            <div className="editor-section-title">
              Candidate context
              <button
                className="btn btn-ghost btn-upload"
                type="button"
                onClick={onImportResume}
                disabled={importingResume}
              >
                <Icon name="upload" />
                {importingResume ? 'Reading…' : 'Upload PDF / text'}
              </button>
            </div>
            <label>
              Resume for this interview
              {resumeFileName ? <span className="hint">Loaded: {resumeFileName}</span> : null}
              <textarea
                rows={5}
                value={active.resume}
                onChange={(e) => onChange({ resume: e.target.value })}
                placeholder="Paste or upload the resume version you want this interview to use"
              />
            </label>
            <label>
              Job description
              <textarea
                rows={4}
                value={active.jobDescription}
                onChange={(e) => onChange({ jobDescription: e.target.value })}
                placeholder="Paste the job description for this company"
              />
            </label>
          </div>

          <div className="editor-section">
            <div className="editor-section-title">Additional information</div>
            <p className="hint">
              Extra context for this interview only — interviewer background, company research, projects to emphasize, or things to avoid. Used with the resume and job description when generating answers.
            </p>
            <label>
              Additional information
              <textarea
                rows={4}
                value={active.additionalInfo || ''}
                onChange={(e) => onChange({ additionalInfo: e.target.value })}
                placeholder="Interviewer name or background, company research, projects to emphasize, constraints…"
              />
            </label>
          </div>

          <div className="editor-section">
            <div className="editor-section-title">Practice simulation</div>
            <p className="hint">
              Run a mock interviewer here with no meeting audio. Reply in the box, then ask for the next question.
            </p>
            <textarea
              rows={2}
              value={simulateReply}
              onChange={(e) => setSimulateReply(e.target.value)}
              placeholder="Type what you would say, then send"
              disabled={listening}
            />
            <div className="session-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={listening || simulating}
                onClick={() => onSimulate?.()}
              >
                {simulating ? 'Asking…' : active.entries.length === 0 ? 'Start simulation' : 'Next question'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={listening || simulating || !simulateReply.trim()}
                onClick={() => {
                  onSimulate?.(simulateReply.trim())
                  setSimulateReply('')
                }}
              >
                Send reply
              </button>
            </div>
          </div>

          <div className="editor-section">
            <div className="editor-section-title">Private notes</div>
            <label>
              Notes
              <textarea
                rows={2}
                value={active.notes}
                onChange={(e) => onChange({ notes: e.target.value })}
                placeholder="Interviewer name, loop, links…"
              />
            </label>
          </div>
          {active.status === 'done' && (active.entries.length > 0 || active.answers.length > 0 || active.debrief) ? (
            <div className="editor-section recap-section">
              <div className="editor-section-title">Interview recap</div>
              <div className="recap-stats">
                <span>
                  <strong>{active.entries.length}</strong> turns
                </span>
                <span>
                  <strong>{active.answers.length}</strong> answers
                </span>
                <span>
                  <strong>{formatSessionDuration(active.entries)}</strong>
                </span>
              </div>
              {active.debrief ? <pre className="debrief-text">{active.debrief}</pre> : (
                <p className="hint">
                  Transcription has stopped. Generate a debrief, copy the transcript, or export Markdown.
                </p>
              )}
              <div className="session-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void copyTranscript()}
                  disabled={active.entries.length === 0}
                >
                  <Icon name={copiedTranscript ? 'check' : 'copy'} />
                  {copiedTranscript ? 'Copied transcript' : 'Copy transcript'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onDebrief?.()}
                  disabled={debriefing || active.entries.length === 0}
                >
                  {debriefing ? 'Writing debrief…' : active.debrief ? 'Refresh debrief' : 'Generate debrief'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => onExport?.()}>
                  Export Markdown
                </button>
              </div>
            </div>
          ) : null}

          <div className="session-actions">
            {active.status !== 'done' ? (
              <button type="button" className="btn btn-ghost" onClick={onMarkDone}>
                <Icon name={listening || paused ? 'stop' : 'check'} />
                {listening || paused ? 'End interview' : 'Mark done'}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm(`Delete ${sessionTitle(active)}? This cannot be undone.`)) {
                  onDelete(active.id)
                }
              }}
              disabled={listening}
            >
              <Icon name="close" />
              Delete interview
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
