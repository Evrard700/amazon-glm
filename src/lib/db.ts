import { Prisma, PrismaClient } from '@prisma/client'

// ============================================================
// FLUIDITÉ + ROBUSTESSE — client Prisma avec relance automatique.
//
// Supabase est hébergé à ~200 ms de RTT : de brèves micro-coupures
// réseau lèvent parfois « Can't reach database server » (P1001),
// « Database server did not respond » (P1002) ou « server closed
// the connection » (P1017). Ces erreurs surviennent à
// l'ÉTABLISSEMENT de la connexion — la requête n'a jamais touché
// le serveur — les relancer est donc SÛR (aucun double effet).
//
// Stratégie (extension Prisma) :
//  - LECTURES (find*, count, aggregate, groupBy…) : jusqu'à 2
//    relances (250 ms puis 600 ms) sur P1001/P1002/P1017 —
//    l'utilisateur ne voit jamais l'erreur.
//  - ÉCRITURES : 1 relance UNIQUEMENT sur P1001/P1002 (échec
//    d'ouverture de connexion, aucun ordre partiel exécuté) ;
//    jamais sur P1017 (connexion coupée en cours d'exécution :
//    un ordre a pu être appliqué).
//  - Le warmup du pool (10 SELECT 1) reste actif plus bas.
// ============================================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __prismaPoolWarmed?: boolean
}

/** Codes d'erreur Prisma d'indisponibilité réseau (connexion). */
const CONNECT_ERROR_CODES = new Set(['P1001', 'P1002'])
const CONN_LOST_CODE = 'P1017' // connexion perdue APRÈS établissement

/** Types d'opérations idempotentes (lectures pures) — relances max. */
const READ_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
])

const isKnownError = (e: unknown, codes: Set<string>): boolean => {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false
  return codes.has(e.code)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const baseClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

// --- Extension de relance (vit dans le client exporté) ---
const withNetworkRetry = baseClient.$extends({
  query: {
    $allOperations({ operation, args, query }) {
      const isRead = READ_OPS.has(operation)
      const maxAttempts = isRead ? 3 : 2 // lectures : 2 relances ; écritures : 1
      const attempt = async (n: number): Promise<unknown> => {
        try {
          return await query(args)
        } catch (error) {
          const connectFail = isKnownError(error, CONNECT_ERROR_CODES)
          const connLost = error instanceof Prisma.PrismaClientKnownRequestError && error.code === CONN_LOST_CODE
          // P1017 : rejoué seulement pour les lectures (jamais les écritures).
          const retryable = connectFail || (isRead && connLost)
          if (!retryable || n >= maxAttempts - 1) throw error
          await wait(n === 0 ? 250 : 600)
          return attempt(n + 1)
        }
      }
      return attempt(0)
    },
  },
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = baseClient

export const db = withNetworkRetry

// ============================================================================
// FLUIDITÉ — pré-établissement du pool de connexions Supabase.
// Chaque NOUVELLE connexion vers le pooler (TLS + auth) coûte ~500 ms ; sans
// warmup, les premières salves parallèles d'une page payent ce coût (~1,6 s
// mesuré pour 3 connexions). On ouvre les 10 connexions autorisées
// (connection_limit=10) dès le premier usage du client, en tâche de fond :
// les premières vraies requêtes trouvent un pool CHAUD.
// ============================================================================
if (!globalForPrisma.__prismaPoolWarmed) {
  globalForPrisma.__prismaPoolWarmed = true
  void Promise.all(
    Array.from({ length: 10 }, () => baseClient.$queryRaw`SELECT 1`.catch(() => undefined)),
  ).catch(() => undefined)
}
