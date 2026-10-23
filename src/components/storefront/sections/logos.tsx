// Section publique LOGOS PARTENAIRES — server component.
import Image from "next/image"
import { Container, recordList, str } from "./section-ui"
import { SectionHeading } from "./section-ui"
import { Reveal } from "./Reveal"

export function LogosSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title, "Ils nous accompagnent")
  const items = recordList(props.items)
  if (items.length === 0) return null

  return (
    <Container className="py-10">
      <SectionHeading title={title} center />
      <Reveal>
        <ul className="flex flex-wrap items-center justify-center gap-3">
          {items.map((it, i) => {
            const name = str(it.name, "Partenaire")
            const image = str(it.image)
            return (
              <li key={i}>
                {image ? (
                  <span
                    className="relative grid h-10 w-24 place-items-center overflow-hidden rounded-lg border bg-card px-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    title={name}
                  >
                    <span className="relative h-7 w-20">
                      <Image src={image} alt={name} fill sizes="80px" className="object-contain" />
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border bg-card px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm transition hover:-translate-y-0.5 hover:text-foreground hover:shadow-md">
                    {name}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </Reveal>
    </Container>
  )
}
