import { db } from "@/lib/db"
const KWAME = "cmvijxnrk000eo3bcg2pthpsm"
await db.user.update({ where: { id: KWAME }, data: { crmTagsJson: JSON.stringify([]) } })
console.log("tags Kwame réinitialisés à []")
await db.$disconnect()
