// Section publique VIDÉO — extraction YouTube → iframe responsive.
import { ExternalLink, Youtube } from "lucide-react"
import { Container, str } from "./section-ui"
import { SectionHeading } from "./section-ui"
import { Reveal } from "./Reveal"

/** Extrait l'ID d'une URL YouTube (watch, youtu.be, shorts, embed) ou renvoie null. */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?(?:.*&)?v=([\w-]{6,})/i,
    /youtu\.be\/([\w-]{6,})/i,
    /youtube\.com\/shorts\/([\w-]{6,})/i,
    /youtube\.com\/embed\/([\w-]{6,})/i,
    /youtube-nocookie\.com\/embed\/([\w-]{6,})/i,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

export function VideoSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title)
  const url = str(props.url)
  const description = str(props.description)
  if (!url) return null

  const id = extractYouTubeId(url)
  const embedUrl = id ? `https://www.youtube-nocookie.com/embed/${id}` : url

  return (
    <Container className="py-10">
      {title && <SectionHeading title={title} center />}
      <Reveal className="mx-auto max-w-4xl">
        {id || url.includes("/embed/") ? (
          <div className="overflow-hidden rounded-xl border bg-card shadow-lg">
            <iframe
              src={embedUrl}
              title={title || "Vidéo Téranga Market"}
              className="aspect-video w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 rounded-xl border bg-card p-8 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <Youtube className="h-6 w-6 text-brand-foreground" aria-hidden />
            Ouvrir la vidéo (lien externe)
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        )}
        {description && (
          <p className="mt-3 text-center text-sm text-muted-foreground">{description}</p>
        )}
      </Reveal>
    </Container>
  )
}
