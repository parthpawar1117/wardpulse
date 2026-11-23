import { useCallback, useState } from 'react'
import { AttentionStrip } from './console/AttentionStrip'
import { BedCard } from './console/BedCard'
import { BedDrawer } from './console/BedDrawer'
import { Header } from './console/Header'
import { useWard } from './console/useWard'

function App() {
  const { state, clock, speed, setSpeed, paused, togglePause } = useWard()
  const [openId, setOpenId] = useState<string | null>(null)
  const closeDrawer = useCallback(() => setOpenId(null), [])
  const open = openId ? state.beds[openId] : null

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-4 py-5">
      <Header
        simTime={state.simTime}
        speed={speed}
        onSpeed={setSpeed}
        paused={paused}
        onTogglePause={togglePause}
        rejected={state.rejected}
      />
      <AttentionStrip state={state} onOpen={setOpenId} />
      <section aria-label="Beds" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {state.order.map((id) => (
          <BedCard key={id} bed={state.beds[id]} clock={clock} onOpen={() => setOpenId(id)} />
        ))}
      </section>
      <footer className="mt-auto pt-2 text-xs text-dim">
        Clinical decision support for evaluation only. Not a medical device. Patients and readings are simulated.
      </footer>
      {open && <BedDrawer bed={open} onClose={closeDrawer} />}
    </main>
  )
}

export default App
