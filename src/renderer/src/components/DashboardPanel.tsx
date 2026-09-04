import type { InterviewSession } from '../types'
import {
  buildDashboardStats,
  formatCompactDuration,
  formatSessionTime,
  sessionTitle
} from '../lib/workspace'
import Icon from './Icon'
import heroArt from '../assets/dashboard-hero.png'
import emptyArt from '../assets/empty-interviews.png'

type DashboardPanelProps = {
  sessions: InterviewSession[]
  ready: boolean
  missingSetup: string[]
  transcribeReady: boolean
  answerReady: boolean
  micReady: boolean
  listening: boolean
  canStart: boolean
  onCreate: () => void
  onOpenInterviews: () => void
  onOpenSettings: () => void
  onSelectSession: (id: string) => void
  onStart: () => void
  onOpenOverlay: () => void
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function ReadinessRing({ value }: { value: number }) {
  const radius = 22
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference
  return (
    <svg className="readiness-ring" viewBox="0 0 56 56" aria-hidden="true">
      <circle className="readiness-ring-track" cx="28" cy="28" r={radius} />
      <circle
        className="readiness-ring-value"
        cx="28"
        cy="28"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  )
}

export default function DashboardPanel({
  sessions,
  ready,
  missingSetup,
  transcribeReady,
  answerReady,
  micReady,
  listening,
  canStart,
  onCreate,
  onOpenInterviews,
  onOpenSettings,
  onSelectSession,
  onStart,
  onOpenOverlay
}: DashboardPanelProps) {
  const stats = buildDashboardStats(sessions)
  const checks = [transcribeReady, answerReady, micReady, sessions.length > 0]
  const readyCount = checks.filter(Boolean).length
  const readyPct = Math.round((readyCount / checks.length) * 100)
  const maxActivity = Math.max(1, ...stats.activity.map((day) => day.count))
  const maxMode = Math.max(1, ...stats.modes.map((mode) => mode.count))

  return (
    <section className="panel dashboard-panel" aria-labelledby="dashboard-title">
      <div className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="panel-label">Overview</p>
          <h2 className="dashboard-title" id="dashboard-title">
            {greeting()}
          </h2>
          <p className="dashboard-lead">
            {stats.total === 0
              ? 'Set up your first interview, add a resume, and keep the overlay ready for live answers.'
              : `${stats.done} completed · ${stats.upcoming + stats.live} upcoming · ${stats.thisWeekDone} finished this week.`}
          </p>
          <div className="dashboard-hero-actions">
            <button type="button" className="btn btn-start" onClick={onCreate}>
              <Icon name="interview" />
              New interview
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!canStart || listening}
              onClick={onStart}
            >
              <Icon name="play" />
              {listening ? 'Live now' : 'Start session'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onOpenOverlay}>
              <Icon name="sparkles" />
              Open overlay
            </button>
          </div>
        </div>
        <div className="dashboard-hero-art">
          <img src={heroArt} alt="" />
        </div>
      </div>

      <div className="dashboard-stats">
        <article className="dash-stat">
          <span className="dash-stat-label">Interviews</span>
          <strong>{stats.total}</strong>
          <span>{stats.live ? `${stats.live} live` : `${stats.upcoming} upcoming`}</span>
        </article>
        <article className="dash-stat">
          <span className="dash-stat-label">Completed</span>
          <strong>{stats.done}</strong>
          <span>{stats.thisWeekDone} this week</span>
        </article>
        <article className="dash-stat">
          <span className="dash-stat-label">Practice time</span>
          <strong>{formatCompactDuration(stats.practiceMs)}</strong>
          <span>{stats.turns} transcript turns</span>
        </article>
        <article className="dash-stat">
          <span className="dash-stat-label">Answers</span>
          <strong>{stats.answers}</strong>
          <span>Suggested during sessions</span>
        </article>
      </div>

      {stats.total === 0 ? (
        <div className="dashboard-empty">
          <img src={emptyArt} alt="" />
          <div>
            <h3>No interview history yet</h3>
            <p>Create a session, paste a resume and job description, then start when the call begins.</p>
            <div className="dashboard-hero-actions">
              <button type="button" className="btn btn-start" onClick={onCreate}>
                <Icon name="interview" />
                Create interview
              </button>
              {!ready ? (
                <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
                  <Icon name="settings" />
                  Finish setup
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          <article className="dashboard-card dashboard-span-2">
            <div className="dashboard-card-head">
              <div>
                <h3>Activity</h3>
                <p>Interviews scheduled across the last 7 days</p>
              </div>
              <Icon name="chart" />
            </div>
            <div className="activity-chart" role="img" aria-label="Interviews over the last 7 days">
              {stats.activity.map((day) => (
                <div key={day.key} className="activity-col">
                  <span className="activity-count">{day.count}</span>
                  <div className="activity-track">
                    <div
                      className={`activity-bar${day.count === 0 ? ' empty' : ''}`}
                      style={{ height: `${Math.max(day.count ? 14 : 6, (day.count / maxActivity) * 100)}%` }}
                    />
                  </div>
                  <span className="activity-label">{day.label}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="dashboard-card">
            <div className="dashboard-card-head">
              <div>
                <h3>Up next</h3>
                <p>Upcoming and in-progress sessions</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenInterviews}>
                View all
              </button>
            </div>
            {stats.nextUp.length === 0 ? (
              <p className="dashboard-quiet">Nothing scheduled. Create an interview to get started.</p>
            ) : (
              <ul className="dashboard-list">
                {stats.nextUp.map((session) => (
                  <li key={session.id}>
                    <button type="button" onClick={() => onSelectSession(session.id)}>
                      <strong>{sessionTitle(session)}</strong>
                      <span>
                        {formatSessionTime(session.scheduledAt)}
                        <em className={`status-badge ${session.status}`}>{session.status}</em>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="dashboard-card">
            <div className="dashboard-card-head">
              <div>
                <h3>Recent history</h3>
                <p>Latest interviews, newest first</p>
              </div>
            </div>
            <ul className="dashboard-list">
              {stats.recent.map((session) => (
                <li key={session.id}>
                  <button type="button" onClick={() => onSelectSession(session.id)}>
                    <strong>{sessionTitle(session)}</strong>
                    <span>
                      {formatSessionTime(session.scheduledAt)}
                      <em className={`status-badge ${session.status}`}>{session.status}</em>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="dashboard-card">
            <div className="dashboard-card-head">
              <div>
                <h3>Interview mix</h3>
                <p>How you have been practicing</p>
              </div>
            </div>
            {stats.modes.length === 0 ? (
              <p className="dashboard-quiet">Modes will show once you add interviews.</p>
            ) : (
              <ul className="mode-mix">
                {stats.modes.slice(0, 5).map((mode) => (
                  <li key={mode.id}>
                    <div>
                      <span>{mode.label}</span>
                      <strong>{mode.count}</strong>
                    </div>
                    <div className="mode-track">
                      <div style={{ width: `${Math.max(8, (mode.count / maxMode) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="dashboard-card readiness-card">
            <div className="dashboard-card-head">
              <div>
                <h3>Readiness</h3>
                <p>{ready ? 'You are ready to go live' : `Finish setup: ${missingSetup.join(', ') || 'add a session'}`}</p>
              </div>
              <div className="readiness-meter">
                <ReadinessRing value={readyPct} />
                <span>{readyPct}%</span>
              </div>
            </div>
            <ul className="readiness-checks">
              <li className={transcribeReady ? 'ok' : ''}>
                <Icon name={transcribeReady ? 'check' : 'audio'} />
                Transcription
              </li>
              <li className={answerReady ? 'ok' : ''}>
                <Icon name={answerReady ? 'check' : 'sparkles'} />
                Answer model
              </li>
              <li className={micReady ? 'ok' : ''}>
                <Icon name={micReady ? 'check' : 'audio'} />
                Microphone
              </li>
              <li className={sessions.length > 0 ? 'ok' : ''}>
                <Icon name={sessions.length > 0 ? 'check' : 'interview'} />
                Interview session
              </li>
            </ul>
            {!ready ? (
              <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
                Open settings
              </button>
            ) : null}
          </article>
        </div>
      )}
    </section>
  )
}
