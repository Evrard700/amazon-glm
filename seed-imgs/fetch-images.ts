/**
 * Recherche d'images pour le seed — exécute les requêtes séquentiellement
 * (respect des limites de débit) et compile seed-imgs/map.json
 */
import { writeFileSync } from "fs"

const QUERIES: Record<string, string> = {
  "01-smartphone": "professional product photo modern smartphone on clean background",
  "02-earbuds": "wireless earbuds product photo white background",
  "03-dress": "african wax print dress colorful fashion product",
  "04-handbag": "stylish leather handbag studio product photo",
  "05-smartwatch": "smartwatch product photo clean background",
  "06-coffee": "espresso coffee machine kitchen appliance product photo",
  "07-blender": "modern blender kitchen appliance product photo",
  "08-perfume": "luxury perfume bottle product photography studio",
  "09-shea": "shea butter skincare jar cosmetic product photo",
  "10-laptop": "modern laptop computer product photo clean background",
  "11-sneakers": "colorful sneakers shoes product photography",
  "12-speaker": "portable bluetooth speaker product photo",
  "13-ebook": "ebook digital reading on tablet flat lay",
  "14-course": "online course learning workspace laptop",
  "15-weather": "smart home weather station device product photo",
  "16-powerbank": "power bank charger smartphone product photo",
  "17-sunglasses": "stylish sunglasses product photography fashion",
  "18-yoga": "yoga fitness mat exercise flat lay",
  "19-deco": "modern cozy living room interior decoration",
  "20-hero": "happy african woman shopping online smartphone bright colorful",
  "21-solarlamp": "solar powered lamp light product",
  "22-tea": "hibiscus bissap tea dried flowers",
  "23-headphones": "over-ear headphones product photo white background",
}

const existing: Record<string, string[]> = {}
try {
  const map = await Bun.file("map.json").json()
  Object.assign(existing, map)
} catch {}

const map: Record<string, string[]> = { ...existing }

for (const [key, query] of Object.entries(QUERIES)) {
  if (map[key] && map[key].length > 0) {
    console.log(`SKIP ${key}`)
    continue
  }
  console.log(`SEARCH ${key}…`)
  try {
    const proc = Bun.spawnSync(["z-ai", "image-search", "-q", query, "-c", "3", "--gl", "us", "--no-rank"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const out = proc.stdout.toString()
    const start = out.indexOf("{")
    if (start >= 0) {
      const json = JSON.parse(out.slice(start))
      if (json.success && Array.isArray(json.results)) {
        map[key] = json.results.map((r: { original_url: string }) => r.original_url).slice(0, 3)
        console.log(`  → ${map[key].length} images`)
        writeFileSync("map.json", JSON.stringify(map, null, 2))
      } else {
        console.log(`  ✗ ${json.error ?? "échec"}`)
      }
    } else {
      console.log("  ✗ pas de JSON")
    }
  } catch (e) {
    console.log(`  ✗ erreur ${e}`)
  }
  await Bun.sleep(2000)
}

console.log("DONE")
console.log(Object.keys(map).length, "clés récupérées")
