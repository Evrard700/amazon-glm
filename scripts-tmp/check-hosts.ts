import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const hosts = new Set<string>()
const products = await db.product.findMany({ select: { imagesJson: true } })
for (const p of products) {
  try {
    const arr = JSON.parse(p.imagesJson || "[]")
    for (const img of arr) {
      const url = typeof img === "string" ? img : typeof img?.url === "string" ? img.url : null
      if (url && url.startsWith("http")) { try { hosts.add(new URL(url).hostname) } catch {} }
    }
  } catch {}
}
// (réglages non nécessaires ici)
const check = (u: string | null | undefined) => { if (u && u.startsWith("http")) { try { hosts.add(new URL(u).hostname) } catch {} } }

console.log("HOTES:", JSON.stringify([...hosts]))
await db.$disconnect()
