// Section publique TEXTE ENRICHI — HTML assaini via DOMPurify (isomorphe :
// serveur ET navigateur), la référence anti-XSS. Remplace l'ancien nettoyage
// regex contournable (entités encodées, attributs exotiques…).
import DOMPurify from "isomorphic-dompurify"
import { Container, str } from "./section-ui"
import { Reveal } from "./Reveal"

/** Balises autorisées — tout le reste est SUPPRIMÉ (pas masqué : supprimé). */
const ALLOWED_TAGS = [
  "b", "i", "em", "strong", "u", "s", "sup", "sub", "mark", "small",
  "p", "br", "hr", "span", "div",
  "h2", "h3", "h4", "blockquote", "pre", "code",
  "ul", "ol", "li",
  "a", "img", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
  "center",
]
const ALLOWED_ATTRS = [
  "href", "target", "rel", "title", "alt",
  "src", "width", "height", "loading",
  "colspan", "rowspan", "align", "class", "id", "dir",
]

/**
 * Assainissement strict : tags/attributs en liste blanche, schémas d'URL
 * sûrs uniquement (http/https/mailto), cibles _blank sécurisées
 * automatiquement (rel="noopener noreferrer").
 */
export function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
    FORBID_TAGS: ["style", "script", "iframe", "form", "input", "object", "embed", "link", "meta", "base"],
    FORBID_ATTR: ["style", "srcset", "formaction", "xlink:href"],
    ADD_ATTR: ["target"],
  })
  // Tout _target blank ouvert par l'éditeur reçoit noopener/noreferrer.
  return clean.replace(/<a\s+([^>]*target=["']_blank["'][^>]*)>/gi, (m, attrs) => {
    const rel = /\brel=/.test(attrs) ? attrs : `${attrs} rel="noopener noreferrer"`
    return `<a ${rel}>`
  })
}

export function RichTextSection({ props }: { props: Record<string, unknown> }) {
  const title = str(props.title)
  const html = str(props.html)
  if (!title && !html) return null

  return (
    <Container className="py-10">
      <Reveal className="mx-auto max-w-3xl">
        {title && <h2 className="mb-4 text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>}
        <div
          className="space-y-4 text-sm leading-7 text-foreground/90 sm:text-base [&_a]:font-semibold [&_a]:text-brand-foreground [&_a]:underline [&_em]:italic [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol]:space-y-2 [&_p]:text-foreground/90 [&_strong]:font-semibold [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-secondary/50 [&_th]:p-2 [&_ul]:space-y-2"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
        />
      </Reveal>
    </Container>
  )
}
