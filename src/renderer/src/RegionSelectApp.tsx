import { useCallback, useEffect, useState } from 'react'

type Rect = { x: number; y: number; width: number; height: number }

export default function RegionSelectApp() {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)

  const cancel = useCallback((): void => {
    window.copilot.completeRegionSelect(null)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  const rect: Rect | null =
    start && current
      ? {
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y)
        }
      : null

  return (
    <div
      className="region-select"
      onMouseDown={(event) => {
        if (event.button !== 0) return
        setStart({ x: event.clientX, y: event.clientY })
        setCurrent({ x: event.clientX, y: event.clientY })
      }}
      onMouseMove={(event) => {
        if (!start) return
        setCurrent({ x: event.clientX, y: event.clientY })
      }}
      onMouseUp={() => {
        if (rect && rect.width >= 8 && rect.height >= 8) {
          window.copilot.completeRegionSelect(rect)
        } else {
          cancel()
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        cancel()
      }}
    >
      <p className="region-hint">Drag to select the problem or codebase · Esc to cancel</p>
      {rect ? (
        <div
          className="region-box"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height
          }}
        />
      ) : null}
    </div>
  )
}
