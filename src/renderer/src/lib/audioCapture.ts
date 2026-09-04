const WORKLET_CODE = `
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.queued = []
    this.targetRate = 16000
    this.chunkSamples = 1600
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input || input.length === 0) return true

    const ratio = sampleRate / this.targetRate
    if (ratio === 1) {
      for (let i = 0; i < input.length; i++) this.queued.push(input[i])
    } else {
      const outLen = Math.floor(input.length / ratio)
      for (let i = 0; i < outLen; i++) {
        const idx = i * ratio
        const i0 = Math.floor(idx)
        const i1 = Math.min(i0 + 1, input.length - 1)
        const frac = idx - i0
        this.queued.push(input[i0] * (1 - frac) + input[i1] * frac)
      }
    }

    while (this.queued.length >= this.chunkSamples) {
      const slice = this.queued.splice(0, this.chunkSamples)
      const pcm = new Int16Array(slice.length)
      for (let i = 0; i < slice.length; i++) {
        const s = Math.max(-1, Math.min(1, slice[i]))
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer])
    }

    return true
  }
}

registerProcessor('pcm-processor', PcmProcessor)
`

let workletUrl: string | null = null

function getWorkletUrl(): string {
  if (!workletUrl) {
    workletUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' }))
  }
  return workletUrl
}

export type CaptureHandle = {
  stream: MediaStream
  context: AudioContext
  stop: () => Promise<void>
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput')
}

export async function ensureMicPermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((t) => t.stop())
}

async function attachPcmPipeline(
  stream: MediaStream,
  onPcm: (chunk: ArrayBuffer) => void
): Promise<CaptureHandle> {
  const context = new AudioContext({ sampleRate: 16000 })
  await context.audioWorklet.addModule(getWorkletUrl())

  const source = context.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(context, 'pcm-processor')
  node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    onPcm(event.data)
  }

  const mute = context.createGain()
  mute.gain.value = 0
  source.connect(node)
  node.connect(mute)
  mute.connect(context.destination)

  if (context.state === 'suspended') {
    await context.resume()
  }

  return {
    stream,
    context,
    stop: async () => {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      mute.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      await context.close()
    }
  }
}

export async function startPcmCapture(
  deviceId: string,
  onPcm: (chunk: ArrayBuffer) => void,
  options?: { raw?: boolean }
): Promise<CaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      channelCount: 1,
      echoCancellation: options?.raw ? false : true,
      noiseSuppression: options?.raw ? false : true,
      autoGainControl: options?.raw ? false : true
    }
  })

  return attachPcmPipeline(stream, onPcm)
}

export async function startSystemAudioCapture(
  onPcm: (chunk: ArrayBuffer) => void
): Promise<CaptureHandle> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: 16,
        height: 16,
        frameRate: 1
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      },
      systemAudio: 'include'
    } as DisplayMediaStreamOptions)
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Could not capture system audio: ${err.message}`
        : 'Could not capture system audio from this computer.'
    )
  }

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop())
    throw new Error(
      'Windows did not provide system audio. Keep using your normal speakers or headphones, then start the session again.'
    )
  }

  return attachPcmPipeline(stream, onPcm)
}
