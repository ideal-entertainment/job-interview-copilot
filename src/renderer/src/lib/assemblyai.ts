import type { Speaker } from '../types'

type TurnMessage = {
  type?: string
  transcript?: string
  utterance?: string
  end_of_turn?: boolean
  turn_is_formatted?: boolean
  turn_order?: number
  error?: string
  message?: string
}

export type TranscriptHandlers = {
  onPartial: (text: string) => void
  onFinal: (text: string, turnOrder: number) => void
  onError: (message: string) => void
  onOpen?: () => void
}

export type AssemblySession = {
  speaker: Speaker
  close: () => void
}

export function connectAssemblyAI(
  token: string,
  speaker: Speaker,
  handlers: TranscriptHandlers
): { socket: WebSocket; send: (chunk: ArrayBuffer) => void; close: () => void } {
  const params = new URLSearchParams({
    sample_rate: '16000',
    encoding: 'pcm_s16le',
    speech_model: 'universal-3-5-pro',
    format_turns: 'true',
    token
  })

  const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params.toString()}`)
  ws.binaryType = 'arraybuffer'

  let closed = false
  const lastFinalByTurn = new Map<number, string>()

  ws.onopen = () => {
    handlers.onOpen?.()
  }

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string') return

    let data: TurnMessage
    try {
      data = JSON.parse(event.data) as TurnMessage
    } catch {
      return
    }

    if (data.type === 'Error' || data.error) {
      handlers.onError(data.error || data.message || 'AssemblyAI error')
      return
    }

    if (data.type !== 'Turn') return

    const text = (data.utterance || data.transcript || '').trim()
    if (!text) return

    const turnOrder = data.turn_order ?? -1

    if (data.end_of_turn) {
      const previous = lastFinalByTurn.get(turnOrder)
      if (previous === text) return
      lastFinalByTurn.set(turnOrder, text)
      handlers.onFinal(text, turnOrder)
      return
    }

    handlers.onPartial(text)
  }

  ws.onerror = () => {
    if (!closed) handlers.onError(`AssemblyAI ${speaker} connection error`)
  }

  ws.onclose = (event) => {
    if (!closed && event.code !== 1000) {
      handlers.onError(`AssemblyAI ${speaker} closed (${event.code})`)
    }
  }

  return {
    socket: ws,
    send: (chunk: ArrayBuffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk)
      }
    },
    close: () => {
      closed = true
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'Terminate' }))
        } catch {
          // ignore
        }
      }
      ws.close()
    }
  }
}
