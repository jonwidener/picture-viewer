import { useEffect, useRef, useState } from 'react'
import { api, type FileInfo } from '../api'

interface Props { file: FileInfo; paused?: boolean; onEnded?: () => void; onError?: () => void }

/** Plays a video via the playback endpoint, waiting while the server transcodes if needed. */
export default function VideoPlayer({ file, paused, onEnded, onError }: Props) {
  const [state, setState] = useState<{ status: string; url: string | null; error?: string }>({ status: 'processing', url: null })
  const video = useRef<HTMLVideoElement>(null)
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError })

  useEffect(() => {
    let alive = true
    let timer: number
    const poll = async () => {
      try {
        const s = await api.playback(file.id)
        if (!alive) return
        setState(s)
        if (s.status === 'processing') timer = window.setTimeout(poll, 1500)
        else if (s.status === 'error') onErrorRef.current?.()
      } catch (e) {
        if (!alive) return
        setState({ status: 'error', url: null, error: String(e) })
        onErrorRef.current?.()
      }
    }
    poll()
    return () => { alive = false; clearTimeout(timer) }
  }, [file.id])

  useEffect(() => {
    const v = video.current
    if (!v) return
    if (paused) v.pause()
    else v.play().catch(() => {})
  }, [paused, state.url])

  if (state.status === 'ready' && state.url)
    return <video ref={video} key={state.url} src={state.url} controls autoPlay playsInline onEnded={onEnded}
      onError={onError} className="max-h-full max-w-full" />
  if (state.status === 'error') return <p className="text-red-400">Can't play this video. {state.error}</p>
  return <p className="animate-pulse text-neutral-400">Converting video for playback…</p>
}
