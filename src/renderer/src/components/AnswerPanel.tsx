import { useState } from 'react'
import Icon from './Icon'

type AnswerPanelProps = {
  answer: string
  answering: boolean
  error?: string
  title?: string
  emptyHint?: string
  loadingHint?: string
  onRetry?: () => void
}

function renderBullets(answer: string) {
  const rawLines = answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const bulletLines = rawLines.filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line))
  const lines = rawLines.map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())

  if (lines.length <= 1 || bulletLines.length < Math.ceil(rawLines.length / 2)) {
    return <p className="answer-text">{answer}</p>
  }

  return (
    <ul className="answer-list">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  )
}

export default function AnswerPanel({
  answer,
  answering,
  error,
  title = 'Suggested answer',
  emptyHint = 'Generate an answer after the interviewer asks a question.',
  loadingHint = 'Finding the latest unanswered question…',
  onRetry
}: AnswerPanelProps) {
  const [copied, setCopied] = useState(false)

  const copyAnswer = async (): Promise<void> => {
    if (!answer) return
    await navigator.clipboard.writeText(answer)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="panel answer-panel" aria-labelledby="answer-title">
      <div className="panel-toolbar">
        <div className="panel-toolbar-title" id="answer-title">
          <Icon name="sparkles" size={14} />
          {title}
        </div>
        <div className="panel-toolbar-actions">
          {copied ? <span className="copy-status" role="status">Copied</span> : null}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            disabled={!answer}
            onClick={() => void copyAnswer()}
            aria-label="Copy suggested answer"
            title="Copy suggested answer"
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
        </div>
      </div>
      <div className="panel-body" aria-live="polite">
        {answering && !answer ? (
          <p className="answer-loading">
            <span className="loading-spinner" aria-hidden="true" />
            {loadingHint}
          </p>
        ) : null}
        {answering && answer ? <p className="answer-streaming">Streaming…</p> : null}
        {error ? (
          <div>
            <p className="error-text" role="alert">{error}</p>
            {onRetry ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
        {!error && !answer && !answering ? (
          <div className="empty-state">
            <Icon name="answer" size={23} />
            <p>{emptyHint}</p>
          </div>
        ) : null}
        {answer ? renderBullets(answer) : null}
      </div>
    </section>
  )
}
