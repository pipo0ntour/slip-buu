// การ์ดบุคลิกการเงิน — โชว์ archetype ที่ derivePersona คำนวณจากพฤติกรรมในช่วงที่เลือก
// คลาส Tailwind ต้องเขียนเต็มสตริง (purge อ่าน static) → map สีเป็นชุดคลาสสำเร็จไว้ล่วงหน้า
const TONES = {
  teal: { tile: 'bg-primary/12 text-primary', ring: 'border-primary/25', chip: 'bg-primary/10 text-primary' },
  coral: { tile: 'bg-coral/15 text-coral', ring: 'border-coral/30', chip: 'bg-coral/10 text-coral' },
  violet: { tile: 'bg-violet-500/12 text-violet-600', ring: 'border-violet-500/25', chip: 'bg-violet-500/10 text-violet-600' },
  amber: { tile: 'bg-amber-500/15 text-amber-600', ring: 'border-amber-500/25', chip: 'bg-amber-500/10 text-amber-600' },
  rose: { tile: 'bg-rose-500/12 text-rose-600', ring: 'border-rose-500/25', chip: 'bg-rose-500/10 text-rose-600' },
  slate: { tile: 'bg-slate-400/15 text-slate-600', ring: 'border-slate-400/25', chip: 'bg-slate-400/10 text-slate-600' },
}

export default function PersonaCard({ persona, periodLabel }) {
  if (!persona) return null
  const tone = TONES[persona.color] || TONES.teal

  return (
    <section className={`mt-4 rounded-2xl border ${tone.ring} bg-card shadow-sm overflow-hidden animate-pop`}>
      <div className="px-5 pt-4 pb-4">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">
          บุคลิกการเงิน{periodLabel ? `${periodLabel}` : ''}
        </p>

        <div className="mt-3 flex items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 ${tone.tile}`}>
            {persona.emoji}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-tight">{persona.title}</h3>
            <p className="text-sm text-muted-foreground leading-snug mt-0.5">{persona.description}</p>
          </div>
        </div>

        {persona.stats?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {persona.stats.map((s, i) => (
              <span
                key={i}
                className={`inline-flex items-baseline gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${tone.chip}`}
              >
                <span className="opacity-70">{s.label}</span>
                <span className="font-bold">{s.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
