import { useMemo, useState } from 'react'
import type { AudioDevice, ConnectionResult, InterviewerSource, KeyStatus, LlmModel, LlmProvider } from '../types'
import { LLM_PROVIDERS } from '../types'
import Icon from './Icon'

type SettingsPanelProps = {
  devices: AudioDevice[]
  micId: string
  loopbackId: string
  interviewerSource: InterviewerSource
  assemblyaiKey: string
  openaiKey: string
  anthropicKey: string
  openrouterKey: string
  keyStatus: KeyStatus
  provider: LlmProvider
  model: string
  models: LlmModel[]
  visionProvider: LlmProvider
  visionModel: string
  visionModels: LlmModel[]
  modelsLoading: boolean
  modelsError: string
  loadingProvider: LlmProvider | null
  savingCredentials: boolean
  credentialsMessage: string
  testingConnections: boolean
  connectionTest: {
    assemblyai: ConnectionResult
    openai: ConnectionResult
    anthropic: ConnectionResult
    openrouter: ConnectionResult
  } | null
  onMicChange: (id: string) => void
  onLoopbackChange: (id: string) => void
  onInterviewerSourceChange: (source: InterviewerSource) => void
  onAssemblyaiKeyChange: (value: string) => void
  onOpenaiKeyChange: (value: string) => void
  onAnthropicKeyChange: (value: string) => void
  onOpenrouterKeyChange: (value: string) => void
  onProviderChange: (provider: LlmProvider) => void
  onModelChange: (model: string) => void
  onVisionProviderChange: (provider: LlmProvider) => void
  onVisionModelChange: (model: string) => void
  onLoadModels: (provider: LlmProvider) => void
  onSaveCredentials: () => void
  onTestConnections: () => void
  onRefreshDevices: () => void
}

const KEY_FIELDS: Array<{
  provider: LlmProvider
  valueKey: 'openaiKey' | 'anthropicKey' | 'openrouterKey'
}> = [
  { provider: 'openai', valueKey: 'openaiKey' },
  { provider: 'anthropic', valueKey: 'anthropicKey' },
  { provider: 'openrouter', valueKey: 'openrouterKey' }
]

function ModelPicker({
  label,
  hint,
  provider,
  model,
  models,
  visionOnly,
  onProviderChange,
  onModelChange
}: {
  label: string
  hint: string
  provider: LlmProvider
  model: string
  models: LlmModel[]
  visionOnly?: boolean
  onProviderChange: (provider: LlmProvider) => void
  onModelChange: (model: string) => void
}) {
  const [query, setQuery] = useState('')
  const providerMeta = LLM_PROVIDERS.find((item) => item.id === provider)
  const source = useMemo(() => {
    if (!visionOnly) return models
    const visionModels = models.filter((item) => item.vision)
    return visionModels.length > 0 ? visionModels : models
  }, [models, visionOnly])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return source
    return source.filter(
      (item) => item.id.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle)
    )
  }, [query, source])
  const selectedVisible = filtered.some((item) => item.id === model)

  return (
    <div className="model-picker">
      <div className="settings-group-title">{label}</div>
      <div className="provider-toggle" role="tablist" aria-label={label}>
        {LLM_PROVIDERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={provider === item.id ? 'active' : ''}
            onClick={() => onProviderChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="model-field">
        {providerMeta?.label || label}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={visionOnly ? 'Filter vision models' : 'Filter loaded models'}
          disabled={source.length === 0}
        />
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={source.length === 0 && !model}
        >
          <option value="">
            {source.length === 0
              ? 'Load models after entering an API key'
              : visionOnly
                ? 'Choose a vision model'
                : 'Choose a model'}
          </option>
          {model && !selectedVisible ? <option value={model}>{model}</option> : null}
          {filtered.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name === item.id ? item.id : `${item.name} (${item.id})`}
            </option>
          ))}
        </select>
      </label>
      {source.length > 0 ? (
        <p className="hint">
          {filtered.length} of {source.length} {providerMeta?.label} {visionOnly ? 'vision ' : ''}
          models
          {model ? ` · selected ${model}` : ''}
        </p>
      ) : (
        <p className="hint">{hint}</p>
      )}
    </div>
  )
}

export default function SettingsPanel({
  devices,
  micId,
  loopbackId,
  interviewerSource,
  assemblyaiKey,
  openaiKey,
  anthropicKey,
  openrouterKey,
  keyStatus,
  provider,
  model,
  models,
  visionProvider,
  visionModel,
  visionModels,
  modelsLoading,
  modelsError,
  loadingProvider,
  savingCredentials,
  credentialsMessage,
  testingConnections,
  connectionTest,
  onMicChange,
  onLoopbackChange,
  onInterviewerSourceChange,
  onAssemblyaiKeyChange,
  onOpenaiKeyChange,
  onAnthropicKeyChange,
  onOpenrouterKeyChange,
  onProviderChange,
  onModelChange,
  onVisionProviderChange,
  onVisionModelChange,
  onLoadModels,
  onSaveCredentials,
  onTestConnections,
  onRefreshDevices
}: SettingsPanelProps) {
  const keyValues = { openaiKey, anthropicKey, openrouterKey }
  const keySetters: Record<LlmProvider, (value: string) => void> = {
    openai: onOpenaiKeyChange,
    anthropic: onAnthropicKeyChange,
    openrouter: onOpenrouterKeyChange
  }

  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="panel-header">
        <div className="panel-heading">
          <span className="panel-heading-icon"><Icon name="settings" /></span>
          <div>
            <h2 className="panel-title" id="settings-title">Settings</h2>
            <p className="panel-description">
              Connect services, choose an answer model and a vision model, and configure interview audio.
            </p>
          </div>
        </div>
      </div>
      <div className="panel-body settings-body">
        <div className="settings-group api-group">
          <div className="settings-group-title">API configuration</div>
          <label>
            AssemblyAI API key
            <input
              type="password"
              autoComplete="off"
              value={assemblyaiKey}
              onChange={(e) => onAssemblyaiKeyChange(e.target.value)}
              placeholder={keyStatus.assemblyai ? 'Saved · leave blank to keep' : 'Required for live transcription'}
            />
          </label>
          <p className="hint">AssemblyAI is used only for live transcription.</p>

          <div className="settings-group-title">Provider keys</div>
          <div className="provider-keys">
            {KEY_FIELDS.map(({ provider: itemProvider, valueKey }) => {
              const meta = LLM_PROVIDERS.find((item) => item.id === itemProvider)
              if (!meta) return null
              const inUse = provider === itemProvider || visionProvider === itemProvider
              return (
                <div
                  key={itemProvider}
                  className={`provider-card${inUse ? ' active' : ''}`}
                >
                  <div className="provider-card-head">
                    <strong>{meta.label} API key</strong>
                    <span className={keyStatus[itemProvider] ? 'test-ok' : 'hint'}>
                      {keyStatus[itemProvider] ? 'Saved' : 'Not saved'}
                    </span>
                  </div>
                  <label>
                    <input
                      type="password"
                      autoComplete="off"
                      value={keyValues[valueKey]}
                      onChange={(e) => keySetters[itemProvider](e.target.value)}
                      placeholder={
                        keyStatus[itemProvider]
                          ? 'Leave blank to keep saved key'
                          : meta.keyPlaceholder
                      }
                    />
                  </label>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={modelsLoading && loadingProvider === itemProvider}
                    onClick={() => onLoadModels(itemProvider)}
                  >
                    <Icon name="sparkles" />
                    {modelsLoading && loadingProvider === itemProvider ? 'Loading models…' : 'Load models'}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="model-pickers">
            <ModelPicker
              label="Answer model"
              hint="Used for Get Answer, Auto hints, debrief, and practice questions. Prefer a fast model."
              provider={provider}
              model={model}
              models={models}
              onProviderChange={onProviderChange}
              onModelChange={onModelChange}
            />
            <ModelPicker
              label="Vision model"
              hint="Used when you capture a screenshot and click Solve. Pick a stronger vision model (Claude Sonnet, GPT-4o, Gemini Pro)."
              provider={visionProvider}
              model={visionModel}
              models={visionModels}
              visionOnly
              onProviderChange={onVisionProviderChange}
              onModelChange={onVisionModelChange}
            />
          </div>
          {modelsError ? <p className="error-text">{modelsError}</p> : null}
          {!visionModel ? (
            <p className="hint">No vision model yet — Solve will fall back to the answer model.</p>
          ) : null}

          <div className="settings-actions">
            <button
              className="btn btn-save"
              type="button"
              onClick={onSaveCredentials}
              disabled={savingCredentials}
            >
              <Icon name="check" />
              {savingCredentials ? 'Saving…' : 'Save API configuration'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={onTestConnections}
              disabled={testingConnections}
            >
              <Icon name="audio" />
              {testingConnections ? 'Testing…' : 'Test connections'}
            </button>
          </div>
          {connectionTest ? (
            <div className="connection-results">
              <span className={connectionTest.assemblyai.ok ? 'test-ok' : 'test-failed'}>
                AssemblyAI: {connectionTest.assemblyai.message}
              </span>
              <span className={connectionTest.openai.ok ? 'test-ok' : 'test-failed'}>
                OpenAI: {connectionTest.openai.message}
              </span>
              <span className={connectionTest.anthropic.ok ? 'test-ok' : 'test-failed'}>
                Claude: {connectionTest.anthropic.message}
              </span>
              <span className={connectionTest.openrouter.ok ? 'test-ok' : 'test-failed'}>
                OpenRouter: {connectionTest.openrouter.message}
              </span>
            </div>
          ) : null}
          {credentialsMessage ? <p className="hint">{credentialsMessage}</p> : null}
          <p className="hint">Keys are encrypted by Windows and are never shown again after saving.</p>
        </div>

        <div className="settings-group audio-group">
          <div className="settings-group-title">Audio</div>
          <label>
            Interviewer Source
            <select
              value={interviewerSource}
              onChange={(e) => onInterviewerSourceChange(e.target.value as InterviewerSource)}
            >
              <option value="system">System Audio (all apps)</option>
              <option value="device">Microphone / room audio only</option>
            </select>
          </label>
          <label>
            Your Microphone
            <select value={micId} onChange={(e) => onMicChange(e.target.value)}>
              <option value="">Select mic</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {interviewerSource === 'device' ? (
            <label>
              Interviewer microphone
              <select value={loopbackId} onChange={(e) => onLoopbackChange(e.target.value)}>
                <option value="">Select microphone</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="btn btn-ghost refresh" type="button" onClick={onRefreshDevices}>
            <Icon name="audio" />
            Refresh devices
          </button>
          <p className="hint">
            {interviewerSource === 'system'
              ? 'Captures Zoom, Meet, WhatsApp, browser calls, and other apps from your speakers. Headphones are recommended.'
              : 'Use a second microphone for in-person interviews. For WhatsApp or browser meetings, switch back to System Audio.'}
          </p>
          <p className="hint">Get answer shortcut: Ctrl+Shift+Space (Cmd+Shift+Space on Mac). Overlay Auto generates when a question is detected.</p>
        </div>
      </div>
    </section>
  )
}
