import { db } from "@/lib/db"

const TEST_ORDERS = ["cmviknceh0023o3f19sgayqqv", "cmvikoit00035o3f1fk4leyrs"]
const AMINATA = "cmvijxnqp000do3bckbbsthqt"

for (const orderId of TEST_ORDERS) {
  const items = await db.orderItem.findMany({ where: { orderId } })
  await db.digitalDownloadGrant.deleteMany({ where: { orderItemId: { in: items.map((i) => i.id) } } })
  await db.orderItem.deleteMany({ where: { orderId } })
  await db.orderEvent.deleteMany({ where: { orderId } })
  await db.refund.deleteMany({ where: { orderId } })
  await db.payment.deleteMany({ where: { orderId } })
  await db.couponRedemption.deleteMany({ where: { orderId } })
  await db.reward.deleteMany({ where: { sourceOrderId: orderId } })
  await db.cart.deleteMany({ where: { convertedOrderId: orderId } })
  await db.order.deleteMany({ where: { id: orderId } })
  console.log("supprimée:", orderId)
}

// Crédit Aminata : retirer le remboursement test (+4000) et sa transaction
const refundTxs = await db.creditTransaction.findMany({ where: { userId: AMINATA, type: "REFUND", orderId: { in: TEST_ORDERS } } })
console.log("tx remboursement test:", refundTxs.map((t) => ({ amount: t.amount, balanceAfter: t.balanceAfter })))
await db.creditTransaction.deleteMany({ where: { id: { in: refundTxs.map((t) => t.id) } } })
const aminata = await db.user.findUniqueOrThrow({ where: { id: AMINATA } })
console.log("crédit actuel:", aminata.storeCredit)
if (refundTxs.length > 0) {
  const credit = aminata.storeCredit - refundTxs.reduce((s, t) => s + t.amount, 0)
  await db.user.update({ where: { id: AMINATA }, data: { storeCredit: credit } })
  console.log("crédit ajusté:", credit)
}

// salesCount du produit numérique test (+1 à la création, jamais décrémenté)
await db.product.update({ where: { id: "cmvijxnuq001uo3bc95hd7wv3" }, data: { salesCount: { decrement: 1 } } })
console.log("salesCount Pack templates décrémenté")

await db.$disconnect()
