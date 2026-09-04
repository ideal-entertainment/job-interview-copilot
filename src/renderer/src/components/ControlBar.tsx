import Icon from './Icon'

type ControlBarProps = {
  listening: boolean
  paused: boolean
  answering: boolean
  canAnswer: boolean
  canStart?: boolean
  startLabel?: string
  onStart: () => void
  onPause: () => void
  onEnd?: () => void
  onAnswer: () => void
  onSecondary: () => void
  secondaryLabel: string
  secondaryIcon?: 'answer' | 'settings'
  compact?: boolean
  canEnd?: boolean
}

export default function ControlBar({
  listening,
  paused,
  answering,
  canAnswer,
  canStart = true,
  startLabel,
  onStart,
  onPause,
  onEnd,
  onAnswer,
  onSecondary,
  secondaryLabel,
  secondaryIcon = 'settings',
  compact = false,
  canEnd = false
}: ControlBarProps) {
  const showEnd = Boolean(canEnd && onEnd)
  return (
    <div className={`control-bar${compact ? ' overlay-controls' : ''}`}>
      <button
        type="button"
        className="btn btn-answer"
        onClick={onAnswer}
        disabled={!canAnswer || answering}
        title={!canAnswer ? 'A transcript and configured model are required' : ''}
      >
        <Icon name="sparkles" />
        {answering ? 'Thinking…' : 'Get answer'}
      </button>
      <div
        className={`${compact ? 'overlay-secondary' : 'control-secondary'}${showEnd ? ' has-end' : ''}`}
      >
        {listening ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onPause}
            aria-label="Pause session"
            title="Pause session"
          >
            <Icon name="pause" />
            {!compact ? 'Pause session' : null}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onStart}
            disabled={!canStart}
            aria-label={startLabel || (paused ? 'Resume session' : 'Start session')}
            title={startLabel || (paused ? 'Resume session' : 'Start session')}
          >
            <Icon name="play" />
            {!compact ? startLabel || (paused ? 'Resume session' : 'Start session') : null}
          </button>
        )}
        {showEnd ? (
          <button
            type="button"
            className="btn btn-stop"
            onClick={onEnd}
            aria-label="End interview"
            title="Stop transcription and close this interview"
          >
            <Icon name="stop" />
            {!compact ? 'End interview' : null}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onSecondary}
          title={secondaryLabel}
          aria-label={secondaryLabel}
        >
          <Icon name={secondaryIcon} />
          {!compact ? secondaryLabel : null}
        </button>
      </div>
    </div>
  )
}
