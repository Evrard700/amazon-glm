"use client"

import { create } from "zustand"
import { toast } from "sonner"

export interface CartLineClient {
  itemId: string
  quantity: number
  unitPrice: number
  lineTotal: number
  product: {
    id: string
    name: string
    slug: string
    type: string
    images: string[]
    stock: number
    trackInventory: boolean
  }
  variant: { id: string; name: string } | null
  /** Ligne en cours d'ajout (UI optimiste) — stylée différemment, jamais envoyée au serveur. */
  pending?: boolean
}

export interface CartClientState {
  lines: CartLineClient[]
  extraLines: { productName: string; quantity: number; message: string; productSlug: string; unitPrice: number }[]
  subtotal: number
  promotionDiscount: number
  couponDiscount: number
  coupon: { code: string; description: string } | null
  promotions: { name: string; description: string; amount: number }[]
  notes: { level: string; message: string }[]
  itemCount: number
  savings: number
  message?: string | null
}

/** Informations minimales pour UNE ligne optimiste instantanée avant réponse serveur. */
export interface OptimisticItemInfo {
  name: string
  slug: string
  image?: string | null
  unitPrice: number
  type?: string
  variantName?: string | null
}

interface CartStore extends CartClientState {
  loading: boolean
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  fetchCart: () => Promise<void>
  addItem: (productId: string, variantId?: string | null, quantity?: number, optimistic?: OptimisticItemInfo) => Promise<boolean>
  updateItem: (itemId: string, quantity: number) => Promise<void>
  removeItem: (itemId: string) => Promise<void>
  applyCoupon: (code: string) => Promise<boolean>
  removeCoupon: () => Promise<void>
  clear: () => Promise<void>
}

const empty: CartClientState = {
  lines: [],
  extraLines: [],
  subtotal: 0,
  promotionDiscount: 0,
  couponDiscount: 0,
  coupon: null,
  promotions: [],
  notes: [],
  itemCount: 0,
  savings: 0,
}

// ============================================================================
// PERSISTANCE LOCALE (SWR côté client) — PANIER INSTANTANÉ
// L'état panier est sauvegardé dans localStorage à chaque changement, puis
// ré-appliqué IMMÉDIATEMENT au chargement suivant : badge, tiroir et page
// panier affichent le bon état sans attendre le moindre aller-retour serveur.
// La revalidation /api/cart (vérité serveur) suit en tâche de fond — elle
// corrige l'instantané s'il a vieilli (autre appareil, déconnexion…).
// ============================================================================
const SNAPSHOT_KEY = "teranga_cart_v1"

interface CartSnapshot extends CartClientState {
  savedAt: number
}

function readSnapshot(): CartSnapshot | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CartSnapshot | null
    if (!parsed || typeof parsed.itemCount !== "number" || !Array.isArray(parsed.lines)) return null
    return parsed
  } catch {
    return null
  }
}

function writeSnapshot(state: CartClientState) {
  if (typeof window === "undefined") return
  // Une ligne « pending » (ajout optimiste en vol) est transitoire : on ne
  // fige pas cet état intermédiaire, la prochaine mise à jour stable écrira.
  if (state.lines.some((l) => l.pending)) return
  const snapshot: CartSnapshot = { ...state, savedAt: Date.now() }
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
  } catch {
    /* quota localStorage dépassé : silencieux */
  }
}

/** true si l'instantané local est suffisamment récent pour ignorer la 1re revalidation. */
let hydrationDone = false

/** Applique l'instantané local s'il existe — UNE seule fois par chargement d'onglet. */
export function hydrateCartFromLocal(): boolean {
  if (hydrationDone || typeof window === "undefined") return false
  hydrationDone = true
  const snap = readSnapshot()
  if (!snap) return false
  const { savedAt: _savedAt, ...cart } = snap
  useCartStore.setState(cart)
  return true
}

/** Efface l'instantané local (déconnexion : le panier repart proprement à zéro). */
export function clearCartSnapshot() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY)
  } catch {
    /* noop */
  }
}

/** Instantané de l'état panier (pour annuler proprement un optimisme en échec). */
function snapshotOf(s: CartStore): CartClientState {
  return {
    lines: s.lines,
    extraLines: s.extraLines,
    subtotal: s.subtotal,
    promotionDiscount: s.promotionDiscount,
    couponDiscount: s.couponDiscount,
    coupon: s.coupon,
    promotions: s.promotions,
    notes: s.notes,
    itemCount: s.itemCount,
    savings: s.savings,
  }
}

/** Applique un panier serveur (les lignes pending disparaissent : vérité serveur). */
function applyServerCart(json: { data: CartClientState & { message?: string | null } }) {
  const { message: _message, ...cart } = json.data
  return cart as CartClientState
}

async function post<T>(body: unknown): Promise<{ ok: boolean; data?: T; error?: string; message?: string | null }> {
  const res = await fetch("/api/cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

export const useCartStore = create<CartStore>((set, get) => ({
  ...empty,
  loading: false,
  drawerOpen: false,
  openDrawer: () => {
    set({ drawerOpen: true })
    get().fetchCart()
  },
  closeDrawer: () => set({ drawerOpen: false }),
  fetchCart: async () => {
    try {
      const res = await fetch("/api/cart", { cache: "no-store" })
      const json = await res.json()
      if (json.ok) {
        set({ ...applyServerCart(json), loading: false })
      }
    } catch {
      /* silencieux */
    }
  },

  // ----- Ajout : UI OPTIMISTE — le tiroir s'ouvre et la ligne apparaît
  // IMMÉDIATEMENT (perçu 0 ms) ; le serveur confirme/recalcule ensuite.
  addItem: async (productId, variantId = null, quantity = 1, optimistic) => {
    const prev = snapshotOf(get())
    if (optimistic) {
      const tempId = `pending-${productId}-${Date.now()}`
      const optimisticLine: CartLineClient = {
        itemId: tempId,
        quantity,
        unitPrice: optimistic.unitPrice,
        lineTotal: optimistic.unitPrice * quantity,
        pending: true,
        product: {
          id: productId,
          name: optimistic.name,
          slug: optimistic.slug,
          type: optimistic.type ?? "PHYSICAL",
          images: optimistic.image ? [optimistic.image] : [],
          stock: 999999,
          trackInventory: false,
        },
        variant: optimistic.variantName ? { id: variantId ?? "pending", name: optimistic.variantName } : null,
      }
      set((s) => ({
        lines: [...s.lines, optimisticLine],
        itemCount: s.itemCount + quantity,
        subtotal: s.subtotal + optimisticLine.lineTotal,
        drawerOpen: true,
      }))
    } else {
      // Sans infos produit : le tiroir s'ouvre quand même immédiatement
      set({ drawerOpen: true, loading: true })
    }
    try {
      const json = await post({ action: "add", productId, variantId, quantity })
      if (json.ok) {
        set({ ...applyServerCart(json as never), loading: false, drawerOpen: true })
        toast.success((json as { message?: string }).message ?? "Article ajouté au panier")
        return true
      }
      // Échec serveur → retour à l'état exact d'avant
      set({ ...prev, loading: false })
      toast.error(json.error ?? "Impossible d'ajouter cet article.")
      return false
    } catch {
      set({ ...prev, loading: false })
      toast.error("Erreur réseau. Réessayez.")
      return false
    }
  },

  // ----- Quantité : mise à jour LOCALE instantanée, vérité serveur ensuite
  updateItem: async (itemId, quantity) => {
    const prev = snapshotOf(get())
    set((s) => {
      if (quantity <= 0) {
        const line = s.lines.find((l) => l.itemId === itemId)
        return {
          lines: s.lines.filter((l) => l.itemId !== itemId),
          itemCount: Math.max(0, s.itemCount - (line?.quantity ?? 0)),
        }
      }
      return {
        lines: s.lines.map((l) =>
          l.itemId === itemId ? { ...l, quantity, lineTotal: l.unitPrice * quantity } : l,
        ),
        itemCount: s.lines.reduce(
          (sum, l) => sum + (l.itemId === itemId ? quantity : l.quantity),
          0,
        ),
      }
    })
    const json = await post({ action: "update", itemId, quantity })
    if (json.ok) {
      set(applyServerCart(json as never))
    } else {
      set(prev) // rollback
      toast.error(json.error)
    }
  },

  // ----- Suppression : retrait LOCAL instantané
  removeItem: async (itemId) => {
    const prev = snapshotOf(get())
    set((s) => {
      const line = s.lines.find((l) => l.itemId === itemId)
      return {
        lines: s.lines.filter((l) => l.itemId !== itemId),
        itemCount: Math.max(0, s.itemCount - (line?.quantity ?? 0)),
      }
    })
    const json = await post({ action: "remove", itemId })
    if (json.ok) {
      set(applyServerCart(json as never))
    } else {
      set(prev) // rollback
      toast.error(json.error)
    }
  },

  applyCoupon: async (code) => {
    const json = await post({ action: "applyCoupon", code })
    if (json.ok) {
      const cart = applyServerCart(json as never)
      set(cart)
      if (cart.coupon) toast.success((json as { message?: string }).message ?? "Code appliqué")
      else toast.error((json as { message?: string }).message ?? "Ce code promo n'a pas pu être appliqué.")
      return !!cart.coupon
    }
    toast.error(json.error ?? "Code invalide.")
    return false
  },
  removeCoupon: async () => {
    const json = await post({ action: "removeCoupon" })
    if (json.ok) {
      set(applyServerCart(json as never))
    }
  },
  clear: async () => {
    const json = await post({ action: "clear" })
    if (json.ok) {
      set(applyServerCart(json as never))
    }
  },
}))

// Persistance automatique : chaque changement d'état re-déclenche une
// sauvegarde (debounce 300 ms pour grouper les salves d'actions).
if (typeof window !== "undefined") {
  let writeTimer: ReturnType<typeof setTimeout> | null = null
  useCartStore.subscribe((state) => {
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(() => writeSnapshot(snapshotOf(state)), 300)
  })
}
