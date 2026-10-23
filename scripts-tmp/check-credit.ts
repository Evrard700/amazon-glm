import { db } from "@/lib/db"
const txs = await db.creditTransaction.findMany({
  where: { userId: "cmvijxnqp000do3bckbbsthqt" },
  orderBy: { createdAt: "asc" },
})
for (const t of txs) console.log(t.createdAt.toISOString(), t.type, t.amount, "→", t.balanceAfter, "|", t.description)
const aminata = await db.user.findUniqueOrThrow({ where: { id: "cmvijxnqp000do3bckbbsthqt" } })
console.log("credit final:", aminata.storeCredit)
const rewards = await db.reward.findMany({ include: { beneficiary: { select: { name: true } } } })
for (const r of rewards) console.log("reward:", r.program, r.status, r.amount, "→", r.beneficiary.name)
await db.$disconnect()
