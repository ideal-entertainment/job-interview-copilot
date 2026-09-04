import { useState } from 'react'
import Icon from './Icon'

type CodePanelProps = {
  code: string
  answering: boolean
  screenshotCount: number
  error?: string
  canSolve?: boolean
  onCapture: () => void
  onSelectArea: () => void
  onClear: () => void
  onSolve: () => void
}

function renderCode(code: string) {
  const blocks = code.split(/```/)
  if (blocks.length < 2) {
    return <pre className="code-text">{code}</pre>
  }
  return (
    <div className="code-blocks">
      {blocks.map((block, index) => {
        if (index % 2 === 1) {
          const newline = block.indexOf('\n')
          const body = newline >= 0 ? block.slice(newline + 1) : block
          return (
            <pre key={index} className="code-fence">
              {body.trim()}
            </pre>
          )
        }
        const text = block.trim()
        return text ? (
          <div key={index} className="code-prose">
            {text.split('\n').map((line, lineIndex) => (
              <p key={lineIndex}>{line}</p>
            ))}
          </div>
        ) : null
      })}
    </div>
  )
}

export default function CodePanel({
  code,
  answering,
  screenshotCount,
  error,
  canSolve = false,
  onCapture,
  onSelectArea,
  onClear,
  onSolve
}: CodePanelProps) {
  const [copied, setCopied] = useState(false)

  const copyCode = async (): Promise<void> => {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="panel code-panel" aria-labelledby="code-title">
      <div className="panel-toolbar">
        <div className="panel-toolbar-title" id="code-title">
          <Icon name="code" size={14} />
          Coding assist
        </div>
        <div className="panel-toolbar-actions">
          {copied ? <span className="copy-status" role="status">Copied</span> : null}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            disabled={!code}
            onClick={() => void copyCode()}
            aria-label="Copy coding notes"
            title="Copy coding notes"
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
        </div>
      </div>
      <div className="code-toolbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSelectArea} title="Drag to capture part of the screen">
          <Icon name="crop" size={13} />
          Select area
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCapture} title="Capture the full display">
          <Icon name="camera" size={13} />
          Full screen
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClear}
          disabled={screenshotCount === 0}
        >
          Clear {screenshotCount > 0 ? `(${screenshotCount})` : ''}
        </button>
        <button
          type="button"
          className="btn btn-answer btn-sm"
          onClick={onSolve}
          disabled={answering || (!canSolve && screenshotCount === 0)}
        >
          {answering ? 'Solving…' : 'Solve'}
        </button>
      </div>
      <div className="panel-body" aria-live="polite">
        {answering && !code ? (
          <p className="answer-loading">
            <span className="loading-spinner" aria-hidden="true" />
            Reading the captured problem…
          </p>
        ) : null}
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        {!error && !code && !answering ? (
          <div className="empty-state">
            <Icon name="camera" size={23} />
            <p>Select the editor or problem on screen, then Solve. Spoken questions and captured code are sent together.</p>
          </div>
        ) : null}
        {code ? renderCode(code) : null}
      </div>
    </section>
  )
}
