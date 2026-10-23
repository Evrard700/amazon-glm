// Section publique BARRE D'AVANTAGES — server component.
import {
  Truck,
  ShieldCheck,
  RotateCcw,
  Headset,
  Gift,
  Percent,
  Star,
  type LucideIcon,
} from "lucide-react"
import { Container, recordList, str } from "./section-ui"
import { Reveal } from "./Reveal"

const ICONS: Record<string, LucideIcon> = {
  truck: Truck,
  shield: ShieldCheck,
  refresh: RotateCcw,
  headset: Headset,
  gift: Gift,
  percent: Percent,
  star: Star,
}

export function UspBarSection({ props }: { props: Record<string, unknown> }) {
  const items = recordList(props.items)
  if (items.length === 0) return null

  return (
    <Container className="py-6">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((it, i) => {
            const Icon = ICONS[str(it.icon, "truck")] ?? Truck
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-foreground">
                  <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-semibold">{str(it.title, "Avantage")}</p>
                  <p className="truncate text-xs text-muted-foreground">{str(it.text)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Reveal>
    </Container>
  )
}
