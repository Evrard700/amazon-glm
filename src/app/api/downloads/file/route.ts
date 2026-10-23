import { NextResponse } from "next/server"
import { handle, fail } from "@/lib/api"
import { serveDigitalFile } from "@/lib/services/digital"

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url)
    const grant = url.searchParams.get("grant")
    const token = url.searchParams.get("token")
    if (!grant || !token) return fail("Paramètres manquants.", 400)

    const ip = request.headers.get("x-real-ip") ?? null
    const userAgent = request.headers.get("user-agent") ?? null
    const result = await serveDigitalFile(grant, token, ip, userAgent)

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(result.fileName)}"`,
        "Cache-Control": "no-store",
      },
    })
  })
}
