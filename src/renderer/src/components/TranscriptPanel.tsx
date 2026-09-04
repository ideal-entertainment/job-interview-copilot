import { useEffect, useRef, useState } from 'react'
import type { TranscriptEntry } from '../types'
import Icon from './Icon'

type TranscriptPanelProps = {
  entries: TranscriptEntry[]
  partialMe?: string
  partialInterviewer?: string
  variant?: 'setup' | 'overlay'
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

export default function TranscriptPanel({
  entries,
  partialMe,
  partialInterviewer,
  variant = 'setup'
}: TranscriptPanelProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const [showJump, setShowJump] = useState(false)

  useEffect(() => {
    const el = scroller.current
    if (el && followLatest.current) el.scrollTop = el.scrollHeight
  }, [entries, partialMe, partialInterviewer])

  const jumpToLatest = (): void => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    followLatest.current = true
    setShowJump(false)
  }

  return (
    <section className="panel transcript-panel" aria-labelledby={`transcript-title-${variant}`}>
      <div className="panel-toolbar">
        <div className="panel-toolbar-title" id={`transcript-title-${variant}`}>
          <Icon name="audio" size={14} />
          Live transcript
        </div>
        <span className="status-badge">{entries.length} turns</span>
      </div>
      <div
        className="panel-body transcript-body"
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget
          const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
          followLatest.current = isNearBottom
          setShowJump(!isNearBottom)
        }}
      >
        {entries.length === 0 && !partialMe && !partialInterviewer ? (
          <div className="empty-state">
            <Icon name="audio" size={23} />
            <p>
              {variant === 'overlay'
                ? 'The conversation will appear here when the session is listening.'
                : 'Start a session to begin live transcription.'}
            </p>
          </div>
        ) : null}
        {entries.map((entry) => (
          <article key={entry.id} className={`transcript-line line-${entry.speaker}`}>
            <span className="speaker-mark">
              <Icon name={entry.speaker === 'interviewer' ? 'interview' : 'user'} size={13} />
            </span>
            <div className="line-content">
              <div className="line-meta">
                <span className="speaker">{entry.speaker === 'interviewer' ? 'Interviewer' : 'You'}</span>
                <time className="line-time" dateTime={new Date(entry.timestamp).toISOString()}>
                  {formatTime(entry.timestamp)}
                </time>
              </div>
              <div className="line-text">{entry.text}</div>
              {entry.translation ? <div className="line-translation">{entry.translation}</div> : null}
            </div>
          </article>
        ))}
        {partialInterviewer ? (
          <article className="transcript-line line-interviewer pending" aria-live="polite">
            <span className="speaker-mark"><Icon name="interview" size={13} /></span>
            <div className="line-content">
              <div className="line-meta"><span className="speaker">Interviewer</span></div>
              <div className="line-text">{partialInterviewer}</div>
            </div>
          </article>
        ) : null}
        {partialMe ? (
          <article className="transcript-line line-me pending" aria-live="polite">
            <span className="speaker-mark"><Icon name="user" size={13} /></span>
            <div className="line-content">
              <div className="line-meta"><span className="speaker">You</span></div>
              <div className="line-text">{partialMe}</div>
            </div>
          </article>
        ) : null}
        {showJump ? (
          <button type="button" className="btn btn-ghost btn-sm jump-latest" onClick={jumpToLatest}>
            Jump to latest
          </button>
        ) : null}
      </div>
    </section>
  )
}
