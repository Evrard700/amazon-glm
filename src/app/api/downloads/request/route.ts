import { z } from "zod"
import { ok, handle, parseBody } from "@/lib/api"
import { requireUser } from "@/lib/auth"
import { requestDownload } from "@/lib/services/digital"
import { enforceRateLimit } from "@/lib/rate-limit"

const schema = z.object({ grantId: z.string().min(1) })

export async function POST(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "download", 20, 60_000)
    const body = await parseBody(request, schema)
    const user = await requireUser()
    const result = await requestDownload(body.grantId, user.id)
    return ok(result)
  })
}
