// Section publique TEXTE SEO — bloc discret en bas de page.
import { Container, str } from "./section-ui"

export function SeoTextSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title)
  const text = str(props.text)
  if (!text && !title) return null

  return (
    <Container className="py-8">
      <div className="mx-auto max-w-4xl rounded-xl border border-dashed bg-stone-50 p-5">
        {title && (
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
        )}
        {text && <p className="mt-2 whitespace-pre-line text-xs leading-6 text-muted-foreground sm:text-sm">{text}</p>}
      </div>
    </Container>
  )
}
