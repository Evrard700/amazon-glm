import { PrismaClient } from "@prisma/client"
// ⚠️ Aucune URL codée en dur : DATABASE_URL vient de l'environnement.
// Usage sandbox : env DATABASE_URL=… bun run bench-db.ts
const db = new PrismaClient()
async function bench(label: string, fn: () => Promise<unknown>, n = 10) {
  await fn()
  const t0 = Date.now()
  for (let i = 0; i < n; i++) await fn()
  console.log(`${label}: ${Math.round((Date.now() - t0) / n)} ms/query`)
}
async function main() {
  await bench("SELECT 1 (session pooler)", () => db.$queryRaw`SELECT 1 as one`)
  await bench("findFirst user", () => db.user.findFirst())
  const t0 = Date.now()
  await Promise.all([db.category.findMany(), db.storeSettings.findFirst(), db.product.count(), db.shippingZone.findMany(), db.paymentMethod.findMany(), db.page.findFirst()])
  console.log(`6 findMany parallèles: ${Date.now() - t0} ms`)
  await db.$disconnect()
}
main()
