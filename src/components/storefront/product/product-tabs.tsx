// Sections produit empilées — Description / Caractéristiques / Avis.
//
// Refonte « pattern Amazon » (sections sémantiques plutôt qu'onglets Radix) :
// - SEO : TOUT le contenu est dans le HTML initial (les onglets cachaient les
//   panneaux inactifs et leurs ids useId divergeaient en SSR streamé) ;
// - Zéro hydratation : composant serveur pur, aucun id généré par useId ;
// - Ancre #avis conservée : les liens de pagination ?rev=N#avis scrollent
//   nativement vers la section (scroll-mt pour le header sticky).
export function ProductTabs({
  description,
  characteristics,
  reviews,
  reviewCount,
}: {
  description: React.ReactNode
  characteristics: React.ReactNode
  reviews: React.ReactNode
  reviewCount: number
}) {
  return (
    <div className="w-full space-y-12">
      <section aria-labelledby="product-section-description">
        <h2 id="product-section-description" className="mb-4 text-lg font-extrabold tracking-tight sm:text-xl">
          Description
        </h2>
        {description}
      </section>

      <section aria-labelledby="product-section-caracteristiques">
        <h2 id="product-section-caracteristiques" className="mb-4 text-lg font-extrabold tracking-tight sm:text-xl">
          Caractéristiques
        </h2>
        {characteristics}
      </section>

      <section id="avis" aria-labelledby="product-section-avis" className="scroll-mt-28">
        <h2 id="product-section-avis" className="mb-4 text-lg font-extrabold tracking-tight sm:text-xl">
          Avis{" "}
          {reviewCount > 0 && (
            <span className="text-sm font-semibold text-muted-foreground">({reviewCount})</span>
          )}
        </h2>
        {reviews}
      </section>
    </div>
  )
}
