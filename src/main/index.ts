import { app, shell, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, screen, safeStorage, session } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { createConnection } from 'net'
import { basename, extname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { PDFParse } from 'pdf-parse'
import {
  generateLlmAnswer,
  isLlmProvider,
  listProviderModels,
  parseImages,
  providerLabel,
  testProviderConnection,
  type LlmProvider
} from './llm'

type CredentialStore = {
  assemblyai?: string
  openai?: string
  anthropic?: string
  openrouter?: string
  provider?: LlmProvider
  model?: string
  visionProvider?: LlmProvider
  visionModel?: string
}

type KeyStatus = {
  assemblyai: boolean
  openai: boolean
  anthropic: boolean
  openrouter: boolean
  provider: LlmProvider
  model: string
  visionProvider: LlmProvider
  visionModel: string
}

let setupWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let regionWindow: BrowserWindow | null = null
let latestOverlayState: unknown = null

function getCredentialPath(): string {
  return join(app.getPath('userData'), 'credentials.json')
}

function readCredentialStore(): CredentialStore {
  try {
    return JSON.parse(readFileSync(getCredentialPath(), 'utf8')) as CredentialStore
  } catch {
    return {}
  }
}

function decryptCredential(value?: string): string {
  if (!value || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return ''
  }
}

function encryptCredential(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is unavailable on this computer.')
  }
  return safeStorage.encryptString(value).toString('base64')
}

function getAssemblyKey(): string {
  return decryptCredential(readCredentialStore().assemblyai)
}

function getProvider(): LlmProvider {
  const stored = readCredentialStore().provider
  return isLlmProvider(stored) ? stored : 'openai'
}

function getProviderKey(provider: LlmProvider): string {
  const store = readCredentialStore()
  if (provider === 'anthropic') return decryptCredential(store.anthropic)
  if (provider === 'openrouter') return decryptCredential(store.openrouter)
  return decryptCredential(store.openai)
}

function getSelectedModel(): string {
  return readCredentialStore().model?.trim() || ''
}

function getVisionProvider(): LlmProvider {
  const stored = readCredentialStore().visionProvider
  return isLlmProvider(stored) ? stored : getProvider()
}

function resolveGenerationTarget(useVision: boolean): { provider: LlmProvider; model: string } {
  if (!useVision) {
    return { provider: getProvider(), model: getSelectedModel() }
  }
  return {
    provider: getVisionProvider(),
    model: getVisionModel() || getSelectedModel()
  }
}

function getVisionModel(): string {
  return readCredentialStore().visionModel?.trim() || ''
}

function getKeyStatus(): KeyStatus {
  return {
    assemblyai: Boolean(getAssemblyKey()),
    openai: Boolean(getProviderKey('openai')),
    anthropic: Boolean(getProviderKey('anthropic')),
    openrouter: Boolean(getProviderKey('openrouter')),
    provider: getProvider(),
    model: getSelectedModel(),
    visionProvider: getVisionProvider(),
    visionModel: getVisionModel()
  }
}

function saveCredentials(payload: {
  assemblyaiKey?: string
  openaiKey?: string
  anthropicKey?: string
  openrouterKey?: string
  provider?: LlmProvider
  model?: string
  visionProvider?: LlmProvider
  visionModel?: string
}): KeyStatus {
  const current = readCredentialStore()
  const assemblyaiKey = payload.assemblyaiKey?.trim()
  const openaiKey = payload.openaiKey?.trim()
  const anthropicKey = payload.anthropicKey?.trim()
  const openrouterKey = payload.openrouterKey?.trim()
  const provider = isLlmProvider(payload.provider) ? payload.provider : getProvider()
  const visionProvider = isLlmProvider(payload.visionProvider)
    ? payload.visionProvider
    : isLlmProvider(current.visionProvider)
      ? current.visionProvider
      : provider
  const next: CredentialStore = {
    assemblyai: assemblyaiKey ? encryptCredential(assemblyaiKey) : current.assemblyai,
    openai: openaiKey ? encryptCredential(openaiKey) : current.openai,
    anthropic: anthropicKey ? encryptCredential(anthropicKey) : current.anthropic,
    openrouter: openrouterKey ? encryptCredential(openrouterKey) : current.openrouter,
    provider,
    model: payload.model !== undefined ? payload.model.trim() : current.model || '',
    visionProvider,
    visionModel:
      payload.visionModel !== undefined ? payload.visionModel.trim() : current.visionModel || ''
  }
  writeFileSync(getCredentialPath(), JSON.stringify(next), { encoding: 'utf8', mode: 0o600 })
  return getKeyStatus()
}

async function requestAssemblyToken(apiKey: string): Promise<string> {
  const url = new URL('https://streaming.assemblyai.com/v3/token')
  url.searchParams.set('expires_in_seconds', '600')
  url.searchParams.set('max_session_duration_seconds', '10800')

  const response = await fetch(url, {
    headers: { authorization: apiKey },
    signal: AbortSignal.timeout(15000)
  })

  const body = (await response.json()) as { token?: string; error?: string; message?: string }
  if (!response.ok || !body.token) {
    throw new Error(body.error || body.message || `AssemblyAI token failed (${response.status})`)
  }
  return body.token
}

function waitForRenderer(url: URL, timeoutMs = 20000): Promise<void> {
  const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const tryConnect = (): void => {
      const socket = createConnection({ host, port })
      socket.once('connect', () => {
        socket.end()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) {
          reject(new Error(`Renderer server at ${host}:${port} did not become ready`))
          return
        }
        setTimeout(tryConnect, 150)
      })
    }
    tryConnect()
  })
}

function loadRenderer(window: BrowserWindow, windowType: 'setup' | 'overlay' | 'region'): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const rendererUrl = new URL(process.env['ELECTRON_RENDERER_URL'])
    if (rendererUrl.hostname === 'localhost') {
      rendererUrl.hostname = '127.0.0.1'
    }
    rendererUrl.searchParams.set('window', windowType)

    void (async () => {
      try {
        await waitForRenderer(rendererUrl)
      } catch (error) {
        console.error(error)
      }
      if (window.isDestroyed()) return

      let retries = 0
      const load = (): void => {
        if (!window.isDestroyed()) void window.loadURL(rendererUrl.toString())
      }
      window.webContents.on('did-fail-load', (_event, errorCode) => {
        if ((errorCode === -102 || errorCode === -105) && retries < 20) {
          retries += 1
          setTimeout(load, 250)
        }
      })
      load()
    })()
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: windowType }
    })
  }
}

function secureExternalLinks(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

function resolveAppIcon(): string | undefined {
  const packaged = join(process.resourcesPath, 'icon.ico')
  const development = join(__dirname, '../../build/icon.ico')
  if (app.isPackaged && existsSync(packaged)) return packaged
  if (existsSync(development)) return development
  return undefined
}

function createSetupWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    center: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#071522',
    icon: resolveAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  window.on('ready-to-show', () => {
    window.maximize()
    window.show()
  })
  window.on('closed', () => {
    setupWindow = null
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close()
  })
  secureExternalLinks(window)
  loadRenderer(window, 'setup')
  return window
}

function createOverlayWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 360,
    minHeight: 560,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    icon: resolveAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  window.setAlwaysOnTop(true, 'screen-saver')
  window.setContentProtection(true)
  window.on('closed', () => {
    overlayWindow = null
  })
  secureExternalLinks(window)
  loadRenderer(window, 'overlay')
  return window
}

type RegionRect = { x: number; y: number; width: number; height: number }

function createRegionWindow(display: Electron.Display): BrowserWindow {
  if (regionWindow && !regionWindow.isDestroyed()) regionWindow.close()
  const window = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setIgnoreMouseEvents(false)
  window.on('closed', () => {
    if (regionWindow === window) regionWindow = null
  })
  loadRenderer(window, 'region')
  regionWindow = window
  return window
}

function pickScreenRegion(): Promise<{ rect: RegionRect; displayId: number } | null> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const picker = createRegionWindow(display)
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: { rect: RegionRect; displayId: number } | null): void => {
      if (settled) return
      settled = true
      ipcMain.removeListener('copilot:regionResult', onResult)
      if (!picker.isDestroyed()) picker.close()
      resolve(result)
    }
    const onResult = (_event: unknown, rect: RegionRect | null): void => {
      if (rect && rect.width >= 8 && rect.height >= 8) {
        finish({ rect, displayId: display.id })
        return
      }
      finish(null)
    }
    ipcMain.once('copilot:regionResult', onResult)
    picker.once('closed', () => finish(null))
    picker.webContents.once('did-finish-load', () => {
      if (!picker.isDestroyed()) picker.show()
    })
    picker.once('ready-to-show', () => {
      if (!picker.isDestroyed()) picker.show()
    })
  })
}

async function captureScreenImage(display = screen.getPrimaryDisplay()) {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor)
    }
  })
  const match =
    sources.find((source) => source.display_id && source.display_id === String(display.id)) ||
    sources[0]
  if (!match) throw new Error('No display was available to capture.')
  return { image: match.thumbnail, display }
}

function allowMediaPermission(permission: string): boolean {
  return permission === 'media' || permission === 'mediaKeySystem' || permission === 'display-capture'
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.personal.interview-copilot')

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowMediaPermission(permission))
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || permission === 'mediaKeySystem'
  })

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 }
      })
      const source = sources[0]
      if (!source) {
        callback({})
        return
      }
      callback({ video: source, audio: 'loopback' })
    } catch {
      callback({})
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('copilot:hasKeys', () => getKeyStatus())

  ipcMain.handle(
    'copilot:saveCredentials',
    (
      _event,
      payload: {
        assemblyaiKey?: string
        openaiKey?: string
        anthropicKey?: string
        openrouterKey?: string
        provider?: LlmProvider
        model?: string
        visionProvider?: LlmProvider
        visionModel?: string
      }
    ) => saveCredentials(payload)
  )

  ipcMain.handle(
    'copilot:listModels',
    async (_event, payload: { provider: LlmProvider; apiKey?: string }) => {
      if (!isLlmProvider(payload?.provider)) {
        throw new Error('Choose OpenAI, Claude, or OpenRouter first.')
      }
      const apiKey = payload.apiKey?.trim() || getProviderKey(payload.provider)
      if (!apiKey) {
        throw new Error(`Add a ${providerLabel(payload.provider)} API key, then load models.`)
      }
      return listProviderModels(payload.provider, apiKey)
    }
  )

  ipcMain.handle('copilot:streamingToken', async () => {
    const apiKey = getAssemblyKey()
    if (!apiKey) {
      throw new Error('AssemblyAI API key is missing. Add it in Settings.')
    }
    return requestAssemblyToken(apiKey)
  })

  ipcMain.handle('copilot:testConnections', async () => {
    const assemblyKey = getAssemblyKey()
    const openaiKey = getProviderKey('openai')
    const anthropicKey = getProviderKey('anthropic')
    const openrouterKey = getProviderKey('openrouter')
    const result = {
      assemblyai: { ok: false, message: 'Key not saved' },
      openai: { ok: false, message: 'Key not saved' },
      anthropic: { ok: false, message: 'Key not saved' },
      openrouter: { ok: false, message: 'Key not saved' }
    }

    if (assemblyKey) {
      try {
        await requestAssemblyToken(assemblyKey)
        result.assemblyai = { ok: true, message: 'Connected' }
      } catch (error) {
        result.assemblyai.message = error instanceof Error ? error.message : 'Connection failed'
      }
    }

    if (openaiKey) result.openai = await testProviderConnection('openai', openaiKey)
    if (anthropicKey) result.anthropic = await testProviderConnection('anthropic', anthropicKey)
    if (openrouterKey) result.openrouter = await testProviderConnection('openrouter', openrouterKey)

    return result
  })

  ipcMain.handle('copilot:importResume', async () => {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose your resume',
      properties: ['openFile'],
      filters: [
        { name: 'Resume documents', extensions: ['pdf', 'txt', 'md'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const selection =
      setupWindow && !setupWindow.isDestroyed()
        ? await dialog.showOpenDialog(setupWindow, options)
        : await dialog.showOpenDialog(options)
    const filePath = selection.filePaths[0]
    if (selection.canceled || !filePath) return null

    const data = await readFile(filePath)
    if (data.byteLength > 10 * 1024 * 1024) {
      throw new Error('Resume file is too large. Choose a file under 10 MB.')
    }

    let text = ''
    if (extname(filePath).toLowerCase() === '.pdf') {
      const parser = new PDFParse({ data: new Uint8Array(data) })
      try {
        text = (await parser.getText()).text
      } finally {
        await parser.destroy()
      }
    } else {
      text = data.toString('utf8')
    }

    text = text.trim()
    if (!text) {
      throw new Error('No readable text was found in this resume.')
    }
    return { fileName: basename(filePath), text }
  })

  ipcMain.handle(
    'copilot:generateAnswer',
    async (
      event,
      payload: {
        transcript?: string
        resume?: string
        jobDescription?: string
        additionalInfo?: string
        company?: string
        role?: string
        prompt?: string
        customInstructions?: string
        mode?: string
        responseStyle?: 'brief' | 'bullets' | 'detailed'
        quickPrompt?: string
        images?: string[]
        task?: 'answer' | 'code' | 'translate' | 'debrief' | 'simulate' | 'preview'
        translateTo?: string
      }
    ) => {
      const task = payload.task || 'answer'
      const transcript = payload.transcript?.trim() || ''
      const quickPrompt = payload.quickPrompt?.trim() || ''
      const images = parseImages(payload.images)
      const useVision = task === 'code' || images.length > 0
      const { provider, model } = resolveGenerationTarget(useVision)
      const apiKey = getProviderKey(provider)
      if (!apiKey) {
        throw new Error(
          `${providerLabel(provider)} API key is missing. Add it in Settings${
            useVision ? ' for the vision model' : ''
          }.`
        )
      }
      if (!model) {
        throw new Error(
          useVision
            ? 'Choose a vision model in Settings for screenshot Solve.'
            : 'Choose an answer model in Settings.'
        )
      }
      if (task === 'answer' && !transcript && !quickPrompt && images.length === 0) {
        throw new Error('Transcript is empty. Start listening first.')
      }
      if (task === 'preview' && !transcript && !quickPrompt) {
        throw new Error('Enter a sample question to preview this prompt.')
      }
      if (task === 'code' && !transcript && images.length === 0 && !quickPrompt) {
        throw new Error('Capture the problem or start listening first.')
      }
      if ((task === 'debrief' || task === 'translate') && !transcript) {
        throw new Error('There is nothing to process yet.')
      }

      const vars: Record<string, string> = {
        company: payload.company?.trim() || 'this company',
        role: payload.role?.trim() || 'this role',
        resume: payload.resume?.trim() || '(not provided)',
        jobDescription: payload.jobDescription?.trim() || '(not provided)',
        additionalInfo: payload.additionalInfo?.trim() || '(not provided)'
      }
      const styleNote =
        payload.responseStyle === 'brief'
          ? 'Output 2-4 very short spoken hints. No long paragraphs.'
          : payload.responseStyle === 'detailed'
            ? 'Output a spoken-ready answer: one short opener, then 4-6 supporting bullets.'
            : 'Output 3-5 concise bullet points. No preamble.'

      const fallbackPrompt = `You are an interview copilot helping a candidate during a live job interview at {{company}} for the {{role}} role.

You will receive the full transcript so far (labeled Interviewer / Me).

Your task:
- Identify the most recent question the interviewer asked that the candidate has NOT yet answered (check "Me" turns for what's already been covered).
- Ignore small talk, filler, or already-answered questions.
- ${styleNote}
- Ground the answer ONLY in the candidate's actual resume/experience below — do not invent accomplishments.
- If the question is behavioral, structure bullets loosely as S/T/A/R.
- Keep the suggestion readable quickly.

--- CANDIDATE RESUME ---
{{resume}}

--- JOB DESCRIPTION ---
{{jobDescription}}

--- ADDITIONAL INFORMATION ---
{{additionalInfo}}`

      let systemPrompt = ''
      let userText = ''
      let maxTokens = 700

      if (task === 'translate') {
        const language = payload.translateTo?.trim() || 'English'
        systemPrompt = `Translate interviewer speech into ${language}. Return only the translation. If it is already in ${language}, return the original text.`
        userText = transcript
        maxTokens = 400
      } else if (task === 'debrief') {
        systemPrompt = `You write a candid post-interview debrief for a candidate interviewing at {{company}} for {{role}}.
Use only the transcript, resume, job description, and additional information. Do not invent facts.

Output markdown with:
## Questions asked
## Strong moments
## Weak or thin answers
## Gaps vs the job description
## 3 things to practice`
          .replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] || '(not provided)')
        userText = `Transcript:\n\n${transcript}\n\nResume:\n${vars.resume}\n\nJob description:\n${vars.jobDescription}\n\nAdditional information:\n${vars.additionalInfo}`
        maxTokens = 1400
      } else if (task === 'simulate') {
        systemPrompt = `You are a realistic interviewer hiring for {{role}} at {{company}}.
Ask ONE next question only. No answer key, no preamble, no quotation marks.
Adapt to the transcript so far. If the transcript is empty, start with a natural opening question.`
          .replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] || '(not provided)')
        if (payload.additionalInfo?.trim()) {
          systemPrompt += `\n\n--- ADDITIONAL INFORMATION ---\n${payload.additionalInfo.trim()}`
        }
        userText = transcript
          ? `Transcript so far:\n\n${transcript}\n\nAsk the next interviewer question.`
          : `Job description:\n${vars.jobDescription}\n\nAsk the opening interviewer question.`
        maxTokens = 220
      } else if (task === 'code') {
        systemPrompt = `You are a live-coding interview copilot for {{role}} at {{company}}.

The interviewer may ask a spoken question AND show a codebase, editor, or OA problem on screen.
Use BOTH the transcript and the attached screenshots.

- If they asked about visible code: find the relevant files/functions, explain what it does, and answer the question.
- If they asked you to implement or fix something: give a working approach and code the candidate can type while talking.
- If the screenshot is a LeetCode-style prompt, solve it.
- Call out what you see on screen so the candidate can confirm they are looking at the right place.

Output markdown:
## What they asked
## What is on screen
## Approach
## Code or talking points
## Say out loud
- short speak-aloud notes

Stay consistent with the candidate resume stack. Do not invent jobs they did not list.`
          .replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] || '(not provided)')
        const extra = payload.customInstructions?.trim()
        if (extra) systemPrompt += `\n\n--- CUSTOM INSTRUCTIONS ---\n${extra}`
        if (payload.additionalInfo?.trim()) {
          systemPrompt += `\n\n--- ADDITIONAL INFORMATION ---\n${payload.additionalInfo.trim()}`
        }
        userText = [
          transcript ? `Transcript so far:\n\n${transcript}` : '',
          quickPrompt ? `Candidate note: ${quickPrompt}` : '',
          images.length
            ? `${images.length} screenshot(s) of the shared editor, problem, or codebase are attached. Treat them as what the interviewer is pointing at.`
            : 'No screenshot yet. Answer from the spoken question if possible, and say if you need the candidate to capture the editor.'
        ]
          .filter(Boolean)
          .join('\n\n') || 'Help with the latest coding question.'
        maxTokens = 2200
      } else {
        const extra = payload.customInstructions?.trim()
        const sourcePrompt = payload.prompt?.trim() || fallbackPrompt
        const merged = extra
          ? `${sourcePrompt}\n\n--- CUSTOM INSTRUCTIONS (always follow) ---\n${extra}`
          : sourcePrompt
        systemPrompt = `${merged.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] || '(not provided)')}\n\nOutput style: ${styleNote}`
        if (payload.additionalInfo?.trim() && !sourcePrompt.includes('{{additionalInfo}}')) {
          systemPrompt += `\n\n--- ADDITIONAL INFORMATION ---\n${payload.additionalInfo.trim()}`
        }
        if (payload.mode) systemPrompt += `\nInterview mode: ${payload.mode}.`
        if (images.length) {
          systemPrompt += `\nThe candidate also captured ${images.length} screenshot(s) of what the interviewer is showing (code, slides, or a problem). Use the transcript question together with the images. If the question is about the visible code, explain it and then answer.`
        }
        userText = [
          transcript ? `Transcript so far:\n\n${transcript}` : '',
          quickPrompt ? `The candidate typed this clarification because speech recognition may have missed it:\n${quickPrompt}` : '',
          images.length ? `${images.length} screenshot(s) of the shared screen are attached.` : ''
        ]
          .filter(Boolean)
          .join('\n\n')
        maxTokens = images.length
          ? 1200
          : payload.responseStyle === 'brief'
            ? 280
            : payload.responseStyle === 'detailed'
              ? 900
              : 560
      }

      event.sender.send('copilot:answerToken', { reset: true, kind: task })
      return generateLlmAnswer({
        provider,
        apiKey,
        model,
        systemPrompt,
        userText,
        images,
        maxTokens,
        onToken: (token) => event.sender.send('copilot:answerToken', { token, kind: task })
      })
    }
  )

  ipcMain.handle('copilot:captureDisplay', async (_event, options?: { region?: boolean }) => {
    const overlayWasVisible = Boolean(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())
    if (overlayWasVisible) {
      overlayWindow?.hide()
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
    try {
      if (options?.region) {
        const picked = await pickScreenRegion()
        if (!picked) return null
        const display =
          screen.getAllDisplays().find((item) => item.id === picked.displayId) ||
          screen.getPrimaryDisplay()
        const { image } = await captureScreenImage(display)
        const size = image.getSize()
        const scaleX = size.width / Math.max(1, display.bounds.width)
        const scaleY = size.height / Math.max(1, display.bounds.height)
        const crop = {
          x: Math.max(0, Math.round(picked.rect.x * scaleX)),
          y: Math.max(0, Math.round(picked.rect.y * scaleY)),
          width: Math.max(8, Math.round(picked.rect.width * scaleX)),
          height: Math.max(8, Math.round(picked.rect.height * scaleY))
        }
        crop.width = Math.min(crop.width, Math.max(1, size.width - crop.x))
        crop.height = Math.min(crop.height, Math.max(1, size.height - crop.y))
        const dataUrl = image.crop(crop).toDataURL()
        if (!dataUrl) throw new Error('The selected area could not be captured.')
        return dataUrl
      }

      const { image } = await captureScreenImage(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()))
      const dataUrl = image.toDataURL()
      if (!dataUrl) throw new Error('Screen capture returned an empty image.')
      return dataUrl
    } finally {
      if (overlayWasVisible && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show()
      } else if (
        overlayWindow &&
        !overlayWindow.isDestroyed() &&
        setupWindow &&
        !setupWindow.isVisible()
      ) {
        overlayWindow.show()
      }
    }
  })

  ipcMain.handle(
    'copilot:exportMarkdown',
    async (_event, payload: { markdown: string; fileName?: string }) => {
      const markdown = payload?.markdown?.trim()
      if (!markdown) throw new Error('Nothing to export yet.')
      const options: Electron.SaveDialogOptions = {
        title: 'Export interview',
        defaultPath: payload.fileName || 'interview.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      }
      const selection =
        setupWindow && !setupWindow.isDestroyed()
          ? await dialog.showSaveDialog(setupWindow, options)
          : await dialog.showSaveDialog(options)
      if (selection.canceled || !selection.filePath) return false
      writeFileSync(selection.filePath, markdown, { encoding: 'utf8' })
      return true
    }
  )

  ipcMain.on('copilot:showOverlay', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      overlayWindow = createOverlayWindow()
    }
    overlayWindow.show()
    overlayWindow.focus()
    if (latestOverlayState) {
      overlayWindow.webContents.send('copilot:overlayState', latestOverlayState)
    }
    setupWindow?.hide()
  })

  ipcMain.on('copilot:showSetup', () => {
    setupWindow?.show()
    setupWindow?.focus()
    overlayWindow?.hide()
  })

  ipcMain.on('copilot:publishOverlayState', (_event, state: unknown) => {
    latestOverlayState = state
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('copilot:overlayState', state)
    }
  })

  ipcMain.on('copilot:overlayAction', (_event, data: unknown) => {
    const action = typeof data === 'string' ? data : (data as { action?: string })?.action
    const payload = typeof data === 'string' ? undefined : (data as { payload?: string })?.payload
    if (action === 'showSetup') {
      setupWindow?.show()
      setupWindow?.focus()
      overlayWindow?.hide()
      return
    }
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.webContents.send('copilot:overlayAction', { action, payload })
    }
  })

  ipcMain.on('copilot:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('copilot:close', (event) => {
    const source = BrowserWindow.fromWebContents(event.sender)
    if (source === overlayWindow) {
      overlayWindow?.hide()
      setupWindow?.show()
      setupWindow?.focus()
    } else {
      source?.close()
    }
  })

  setupWindow = createSetupWindow()
  overlayWindow = createOverlayWindow()

  const registered = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.webContents.send('copilot:overlayAction', { action: 'answer' })
    }
  })
  if (!registered) {
    console.warn('Could not register the Get answer shortcut (Ctrl/Cmd+Shift+Space).')
  }

  app.on('activate', () => {
    if (!setupWindow || setupWindow.isDestroyed()) setupWindow = createSetupWindow()
    setupWindow.show()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
