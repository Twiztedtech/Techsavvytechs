import {useEffect, useRef, useState} from 'react'

// Muted, looping hero clip (ported from willjacksons.com). It starts playing
// once it scrolls into view, never for readers who prefer reduced motion, and
// keeps native controls so it can always be paused.
export function BlogVideo({src, poster, label, className = ''}: {src: string; poster?: string; label: string; className?: string}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (!preference.matches) void video.play().catch(() => { /* Native controls remain available. */ })
        observer.disconnect()
      }
    }, {threshold: 0.25})
    const onPreferenceChange = () => { if (preference.matches) video.pause() }
    observer.observe(video)
    preference.addEventListener('change', onPreferenceChange)
    return () => {
      observer.disconnect()
      preference.removeEventListener('change', onPreferenceChange)
      video.pause()
    }
  }, [src])

  return (
    <div className={`relative overflow-hidden bg-brand-slate ${className}`}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        aria-label={label}
        muted
        loop
        playsInline
        controls
        preload="none"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {failed && <p role="status" className="absolute inset-x-0 bottom-12 bg-black/80 p-3 text-center text-sm text-white">This video could not be loaded.</p>}
    </div>
  )
}
