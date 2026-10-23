import { db } from "@/lib/db"
const KWAME = "cmvijxnrk000eo3bcg2pthpsm"
const txs = await db.creditTransaction.findMany({ where: { userId: KWAME, type: "ADMIN_ADJUSTMENT" } })
console.log("tx test:", txs.map((t) => t.amount))
if (txs.length === 2 && txs.reduce((s, t) => s + t.amount, 0) === 0) {
  await db.creditTransaction.deleteMany({ where: { id: { in: txs.map((t) => t.id) } } })
  console.log("transactions test supprimées (somme nulle)")
}
const notes = await db.customerNote.findMany({ where: { userId: KWAME, content: { contains: "agent 3-a" } } })
await db.customerNote.deleteMany({ where: { id: { in: notes.map((n) => n.id) } } })
console.log("notes test supprimées:", notes.length)
const kwame = await db.user.findUniqueOrThrow({ where: { id: KWAME } })
const tags = JSON.parse(kwame.crmTagsJson || "[]") as string[]
const cleaned = tags.filter((t) => t !== "test-3a")
if (cleaned.length !== tags.length) {
  await db.user.update({ where: { id: KWAME }, data: { crmTagsJson: JSON.stringify(cleaned) } })
  console.log("tags nettoyés:", cleaned)
}
await db.$disconnect()
