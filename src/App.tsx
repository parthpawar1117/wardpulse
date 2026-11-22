function App() {
  return (
    <main className="min-h-screen px-4 py-6">
      <header className="mx-auto flex max-w-6xl items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">WardPulse</h1>
        <p className="font-mono text-xs uppercase tracking-wider text-dim">
          Ward console · simulated data
        </p>
      </header>
      <section className="mx-auto mt-8 max-w-6xl rounded-lg border border-edge bg-panel p-6">
        <p className="text-dim">
          Central station coming online. The simulator and signal engine land in the next blocks.
        </p>
      </section>
    </main>
  )
}

export default App
