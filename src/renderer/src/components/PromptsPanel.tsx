import { useState, type FormEvent } from 'react'
import type { PromptTemplate } from '../types'
import { DEFAULT_PROMPT_ID } from '../lib/workspace'
import Icon from './Icon'
import AnswerPanel from './AnswerPanel'

type PromptsPanelProps = {
  prompts: PromptTemplate[]
  selectedId: string
  instructions: string
  sessionLabel?: string
  canPreview: boolean
  previewing: boolean
  previewAnswer: string
  previewError: string
  onSelect: (id: string) => void
  onChange: (patch: Partial<PromptTemplate>) => void
  onInstructionsChange: (value: string) => void
  onCreate: () => void
  onDuplicate: () => void
  onDelete: () => void
  onPreview: (sampleQuestion: string) => void
}

const SAMPLE_QUESTIONS = [
  'Tell me about yourself.',
  'Why do you want this role?',
  'Tell me about a time you disagreed with a teammate.',
  'Walk me through a technical project you are proud of.',
  'What are your salary expectations?'
]

export default function PromptsPanel({
  prompts,
  selectedId,
  instructions,
  sessionLabel,
  canPreview,
  previewing,
  previewAnswer,
  previewError,
  onSelect,
  onChange,
  onInstructionsChange,
  onCreate,
  onDuplicate,
  onDelete,
  onPreview
}: PromptsPanelProps) {
  const active = prompts.find((prompt) => prompt.id === selectedId) || prompts[0]
  const [sampleQuestion, setSampleQuestion] = useState(SAMPLE_QUESTIONS[0])
  if (!active) return null

  const runPreview = (event?: FormEvent): void => {
    event?.preventDefault()
    onPreview(sampleQuestion)
  }

  return (
    <section className="panel manager-panel prompts-studio" aria-labelledby="prompts-title">
      <div className="panel-header">
        <div className="panel-heading">
          <span className="panel-heading-icon"><Icon name="prompt" /></span>
          <div>
            <h2 className="panel-title" id="prompts-title">Prompts & instructions</h2>
            <p className="panel-description">
              Edit the interview prompt and standing instructions together, then test them with a sample question.
            </p>
          </div>
        </div>
        <span className="status-badge">{prompts.length} templates</span>
      </div>
      <div className="panel-body prompts-studio-body">
        <aside className="manager-list" aria-label="Prompt templates">
          <button type="button" className="btn btn-start" onClick={onCreate}>
            <Icon name="prompt" />
            New prompt
          </button>
          <div className="manager-group">
            <div className="manager-group-title">Templates</div>
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                className={`manager-item ${prompt.id === active.id ? 'active' : ''}`}
                onClick={() => onSelect(prompt.id)}
              >
                <strong>{prompt.name}</strong>
                <span>{prompt.builtIn ? 'Built-in' : 'Custom'}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="manager-editor prompts-editor">
          <div className="editor-section">
            <div className="editor-section-title">
              Interview prompt
              <span className="status-badge">{active.builtIn ? 'Built-in' : 'Custom'}</span>
            </div>
            <label>
              Name
              <input
                type="text"
                value={active.name}
                disabled={active.builtIn}
                onChange={(e) => onChange({ name: e.target.value, updatedAt: Date.now() })}
              />
            </label>
            <label>
              Prompt
              <textarea
                rows={11}
                value={active.body}
                disabled={active.builtIn}
                onChange={(e) => onChange({ body: e.target.value, updatedAt: Date.now() })}
                placeholder="Instructions for Get Answer"
              />
            </label>
            <p className="hint">
              Variables: {'{{company}}'}, {'{{role}}'}, {'{{resume}}'}, {'{{jobDescription}}'}, and {'{{additionalInfo}}'}.
              The live transcript is added automatically during a session.
            </p>
            {active.builtIn ? (
              <p className="hint">Built-in templates are read-only. Duplicate this one to customize it.</p>
            ) : null}
          </div>

          <div className="editor-section">
            <div className="editor-section-title">
              Standing instructions
              <span className={`status-badge ${instructions.trim() ? 'live' : ''}`}>
                {instructions.trim() ? 'Active' : 'Optional'}
              </span>
            </div>
            <p className="hint">
              Applied to every interview, on top of the prompt you select for a session.
            </p>
            <label>
              Instructions
              <textarea
                rows={7}
                value={instructions}
                onChange={(e) => onInstructionsChange(e.target.value)}
                placeholder={`Examples:
- Answer in concise spoken English I can say in under 10 seconds.
- I am a backend engineer (Node/TypeScript, PostgreSQL). Do not suggest frontend-heavy stories.
- Never invent companies, metrics, or tools that are not in the resume.`}
              />
            </label>
          </div>

          <div className="session-actions">
            <button type="button" className="btn btn-ghost" onClick={onDuplicate}>
              <Icon name="copy" />
              Duplicate
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm(`Delete “${active.name}”? This cannot be undone.`)) onDelete()
              }}
              disabled={prompts.length < 2 || active.id === DEFAULT_PROMPT_ID}
            >
              <Icon name="close" />
              Delete
            </button>
          </div>
        </div>

        <div className="prompt-test">
          <div className="editor-section">
            <div className="editor-section-title">Performance test</div>
            <p className="hint">
              Runs this prompt plus your standing instructions
              {sessionLabel ? ` against ${sessionLabel}` : ' against the open interview'}
              {' '}resume and job description.
            </p>
            <div className="sample-chips" role="group" aria-label="Sample questions">
              {SAMPLE_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  className={sampleQuestion === question ? 'active' : ''}
                  onClick={() => setSampleQuestion(question)}
                >
                  {question}
                </button>
              ))}
            </div>
            <form className="preview-form" onSubmit={runPreview}>
              <label>
                Sample interviewer question
                <textarea
                  rows={3}
                  value={sampleQuestion}
                  onChange={(e) => setSampleQuestion(e.target.value)}
                  placeholder="Paste or type a question you expect in this interview"
                />
              </label>
              <button
                type="submit"
                className="btn btn-answer"
                disabled={previewing || !canPreview || !sampleQuestion.trim()}
                title={!canPreview ? 'Choose an answer model in Settings first' : ''}
              >
                <Icon name="sparkles" />
                {previewing ? 'Generating…' : 'Generate preview'}
              </button>
            </form>
          </div>
          <AnswerPanel
            answer={previewAnswer}
            answering={previewing}
            error={previewError}
            title="Preview answer"
            emptyHint="Pick a sample question, then generate a preview to see how this prompt performs."
            loadingHint="Running the selected prompt and instructions…"
            onRetry={runPreview}
          />
        </div>
      </div>
    </section>
  )
}
