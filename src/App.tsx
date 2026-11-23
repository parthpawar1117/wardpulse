import { useCallback, useEffect, useState } from 'react'
import { AttentionStrip } from './console/AttentionStrip'
import { AuditLog } from './console/AuditLog'
import { BedCard } from './console/BedCard'
import { BedDrawer } from './console/BedDrawer'
import { EmergencyBanner } from './console/EmergencyBanner'
import { FleetPanel } from './console/FleetPanel'
import { Header } from './console/Header'
import { PhonesPanel, RingToast } from './console/Phones'
import { snapshotFromHash } from './console/snapshot'
import { SnapshotView } from './console/SnapshotView'
import { SyncPanel } from './console/SyncPanel'
import { DEMO_STAFF } from './console/staff'
import { useAlarmTone } from './console/useAlarmTone'
import { isPage, useRinging } from './console/useRinging'
import { useWard } from './console/useWard'
import { useSync } from './sync/useSync'

function Console() {
  const sync = useSync()
  const { state, clock, speed, setSpeed, paused, togglePause, actions } = useWard(sync.enqueue)
  const [openId, setOpenId] = useState<string | null>(null)
  const [phones, setPhones] = useState(false)
  const [sound, setSound] = useState(false)
  const closeDrawer = useCallback(() => setOpenId(null), [])
  const ringing = useRinging(state.messages)
  const alarmFor = (id: string) => state.alarms.find((a) => a.bed === id)
  const unanswered = state.alarms.some((a) => a.priority === 'P1' && a.state === 'active')
  useAlarmTone(unanswered, sound)
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
        sound={sound}
        onToggleSound={() => setSound((s) => !s)}
        pages={state.messages.filter(isPage).length}
        onPhones={() => setPhones((p) => !p)}
        uplink={{ online: sync.stats.online, queued: sync.stats.queued }}
      />
      <EmergencyBanner alarms={state.alarms} audit={state.audit} simTime={state.simTime} actions={actions} onOpen={setOpenId} />
      <AttentionStrip state={state} onOpen={setOpenId} />
      <section aria-label="Beds" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {state.order.map((id) => (
          <BedCard key={id} bed={state.beds[id]} alarm={alarmFor(id)} clock={clock} onOpen={() => setOpenId(id)} />
        ))}
      </section>
      <section aria-label="Ward systems" className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <SyncPanel sync={sync} />
        <FleetPanel state={state} />
      </section>
      <AuditLog audit={state.audit} />
      <footer className="mt-auto pt-2 text-xs text-dim">
        Clinical decision support for evaluation only. Not a medical device. Patients and readings are simulated.
      </footer>
      {open && (
        <BedDrawer
          bed={open}
          alarm={alarmFor(open.id)}
          history={state.audit.filter((e) => e.bed === open.id)}
          actions={actions}
          onClose={closeDrawer}
        />
      )}
      {phones && (
        <PhonesPanel staff={DEMO_STAFF} messages={state.messages} ringing={ringing} onSend={actions.chat} onClose={() => setPhones(false)} />
      )}
      {!phones && <RingToast staff={DEMO_STAFF} ringing={ringing} onOpen={() => setPhones(true)} />}
    </main>
  )
}

/** A link with '#snap=...' opens a frozen snapshot instead of the live console. */
function App() {
  const [snap, setSnap] = useState(() => snapshotFromHash(location.hash))
  useEffect(() => {
    const onHash = () => setSnap(snapshotFromHash(location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return snap ? <SnapshotView snap={snap} /> : <Console />
}

export default App
