/**
 * SEED — Téranga Market
 * Peuple la base avec un catalogue crédible, des commandes réelles réparties sur 45 jours,
 * des programmes marketing configurés, des récompenses dans tous les états, etc.
 * Usage : bun scripts/seed.ts
 */
import { PrismaClient } from "@prisma/client"
import { randomBytes, scryptSync } from "crypto"
import { mkdirSync, writeFileSync, readFileSync } from "fs"

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

// ---------- Images (issues de la recherche web, OSS-hébergées) ----------
const imagesMap: Record<string, string[]> = (() => {
  try {
    return JSON.parse(readFileSync("seed-imgs/map.json", "utf-8")) as Record<string, string[]>
  } catch {
    console.warn("⚠ seed-imgs/map.json absent → images vides (placeholder)")
    return {}
  }
})()

const img = (key: string): string[] => imagesMap[key] ?? []

const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 24 * 3600 * 1000 + h * 3600 * 1000)
const daysAhead = (d: number) => new Date(Date.now() + d * 24 * 3600 * 1000)

async function main() {
  console.log("🌱 Seed Téranga Market — démarrage…")

  // Nettoyage (base de démonstration fraîche)
  const tables = [
    "downloadLog", "digitalDownloadGrant", "creditTransaction", "reward", "upsellAcceptance",
    "refund", "paymentEvent", "payment", "orderEvent", "orderItem", "couponRedemption", "order",
    "cartItem", "cart", "review", "upsellOffer", "promotion", "coupon", "pageVersion", "page",
    "productCollection", "productCategory", "productVariant", "product", "collection", "category",
    "newsletterSubscriber", "campaign", "customerNote", "activityLog", "shippingZone", "paymentMethod",
    "fullRefundProgram", "referralProgram", "storeSettings", "user",
  ] as const
  for (const t of tables) {
    // @ts-expect-error deleteMany dynamique
    await db[t].deleteMany()
  }

  // ---------- 1. Paramètres boutique ----------
  await db.storeSettings.create({
    data: {
      id: 1,
      storeName: "Téranga Market",
      tagline: "Le meilleur du shopping en ligne",
      primaryColor: "#18181b",
      accentColor: "#f59e0b",
      announcementActive: true,
      announcementText: "🚚 Livraison OFFERTE dès 50 000 FCFA — Paiement à la livraison partout à Abidjan",
      contactEmail: "evrardguehisea731@gmail.com",
      contactPhone: "+225 27 22 00 00 00",
      whatsappNumber: "+225 07 07 07 07 07",
      addressLine: "Cocody, Abidjan, Côte d'Ivoire",
      footerAbout:
        "Téranga Market est votre marketplace de confiance : produits vérifiés, paiement à la livraison possible, support réactif 7j/7 et programme de parrainage généreux.",
      metaTitle: "Téranga Market — Le meilleur du shopping en ligne",
      metaDescription: "Marketplace africaine : électronique, mode, maison, produits numériques. Paiement à la livraison, parrainage payant.",
      freeShippingThreshold: 50000,
      lowStockThreshold: 5,
      guestCheckoutEnabled: true,
      reviewsAutoApprove: false,
    },
  })
  console.log("✓ Paramètres boutique")

  // ---------- 2. Moyens de paiement (COD actif, autres à configurer — honnête) ----------
  await db.paymentMethod.createMany({
    data: [
      { code: "cash_on_delivery", name: "Paiement à la livraison", isOnline: false, isActive: true, position: 1, description: "Payez en espèces à la réception de votre colis.", instructions: "Préparez le montant exact si possible. Le livreur vous remet un reçu." },
      { code: "wave", name: "Wave", isOnline: true, isActive: false, position: 2, description: "Paiement mobile Wave — nécessite la configuration des clés API serveur." },
      { code: "orange_money", name: "Orange Money", isOnline: true, isActive: false, position: 3, description: "Paiement mobile Orange Money — nécessite la configuration du marchand." },
      { code: "mtn_momo", name: "MTN MoMo", isOnline: true, isActive: false, position: 4, description: "MTN Mobile Money — nécessite la configuration du marchand." },
      { code: "stripe", name: "Stripe (carte bancaire)", isOnline: true, isActive: false, position: 5, description: "Cartes Visa/Mastercard via Stripe — nécessite les clés secrètes Stripe." },
    ],
  })

  // ---------- 3. Zones de livraison ----------
  const zones = await Promise.all([
    db.shippingZone.create({ data: { name: "Abidjan Sud (Cocody, Plateau, Marcory…)", citiesJson: JSON.stringify(["Cocody", "Plateau", "Marcory", "Treichville", "Koumassi"]), baseCost: 1000, estimatedDaysMin: 1, estimatedDaysMax: 2, position: 1 } }),
    db.shippingZone.create({ data: { name: "Abidjan Nord (Yopougon, Abobo, Adjamé…)", citiesJson: JSON.stringify(["Yopougon", "Abobo", "Adjamé", "Anyama", "Bingerville"]), baseCost: 1500, estimatedDaysMin: 1, estimatedDaysMax: 3, position: 2 } }),
    db.shippingZone.create({ data: { name: "Grand Abidjan (Bassam, Songon, Dabou)", citiesJson: JSON.stringify(["Bassam", "Songon", "Dabou"]), baseCost: 2500, estimatedDaysMin: 2, estimatedDaysMax: 4, position: 3 } }),
    db.shippingZone.create({ data: { name: "Intérieur de la Côte d'Ivoire", citiesJson: JSON.stringify(["Bouaké", "Yamoussoukro", "San-Pédro", "Korhogo", "Daloa", "Autre ville"]), baseCost: 3500, estimatedDaysMin: 2, estimatedDaysMax: 5, position: 4 } }),
  ])
  console.log("✓ Paiements & zones de livraison")

  // ---------- 4. Utilisateurs ----------
  // ⚠️ AUCUN mot de passe réel dans ce fichier (public sur GitHub) :
  // les mots de passe sont fournis par des variables d'environnement
  // au moment du seed (SEED_OWNER_PASSWORD, SEED_STAFF_PASSWORD, SEED_CLIENT_PASSWORD).
  const PW_OWNER = process.env.SEED_OWNER_PASSWORD ?? "ChangeOwner-Me!"
  const PW_STAFF = process.env.SEED_STAFF_PASSWORD ?? "ChangeStaff-Me!"
  const PW_CLIENT = process.env.SEED_CLIENT_PASSWORD ?? "ChangeClient-Me!"
  const owner = await db.user.create({ data: { name: "Evrard Guehisea", email: "evrardguehisea731@gmail.com", passwordHash: hashPassword(PW_OWNER), role: "OWNER", phone: "+225 07 00 00 00 01", referralCode: "EVRARD-001", city: "Cocody", address: "Rue des Jardins, Cocody", marketingConsent: true, createdAt: daysAgo(60) } })
  const admin = await db.user.create({ data: { name: "Ibrahim Koné", email: "admin@teranga.market", passwordHash: hashPassword(PW_STAFF), role: "ADMIN", phone: "+225 07 00 00 00 02", referralCode: "IBRA-002", createdAt: daysAgo(58) } })
  const marketer = await db.user.create({ data: { name: "Awa Diallo", email: "marketing@teranga.market", passwordHash: hashPassword(PW_STAFF), role: "MARKETING", phone: "+225 07 00 00 00 03", referralCode: "AWAD-003", createdAt: daysAgo(55) } })
  await db.user.create({ data: { name: "Koffi Yao", email: "staff@teranga.market", passwordHash: hashPassword(PW_STAFF), role: "STAFF", phone: "+225 07 00 00 00 04", referralCode: "KOFF-004", createdAt: daysAgo(50) } })

  const aminata = await db.user.create({ data: { name: "Aminata Traoré", email: "aminata@example.com", passwordHash: hashPassword(PW_CLIENT), role: "CUSTOMER", phone: "+225 07 11 11 11 01", referralCode: "AMIN-0A1", city: "Cocody", address: "Angré 7ème tranche", marketingConsent: true, createdAt: daysAgo(60) } })
  const kwame = await db.user.create({ data: { name: "Kwame Mensah", email: "kwame@example.com", passwordHash: hashPassword(PW_CLIENT), role: "CUSTOMER", phone: "+225 05 22 22 22 02", referralCode: "KWAM-0B2", city: "Yopougon", address: "Yopougon Niangon", createdAt: daysAgo(50) } })
  const fatou2 = await db.user.create({ data: { name: "Fatou Bamba", email: "fatou@example.com", passwordHash: hashPassword(PW_CLIENT), role: "CUSTOMER", phone: "+225 01 33 33 33 03", referralCode: "FATB-0C3", city: "Marcory", address: "Marcory Zone 4", createdAt: daysAgo(45) } })
  const moussa = await db.user.create({ data: { name: "Moussa Coulibaly", email: "moussa@example.com", passwordHash: hashPassword(PW_CLIENT), role: "CUSTOMER", phone: "+225 07 44 44 44 04", referralCode: "MOUS-0D4", city: "Bouaké", address: "Quartier Air France", createdAt: daysAgo(40) } })
  // Chaîne de parrainage : Aminata parraine Kwame, Fatou B. et Moussa
  await db.user.update({ where: { id: kwame.id }, data: { referredById: aminata.id, referralSource: "SIGNUP", referralAppliedAt: daysAgo(48) } })
  await db.user.update({ where: { id: fatou2.id }, data: { referredById: aminata.id, referralSource: "SIGNUP", referralAppliedAt: daysAgo(43) } })
  await db.user.update({ where: { id: moussa.id }, data: { referredById: aminata.id, referralSource: "SIGNUP", referralAppliedAt: daysAgo(38) } })
  console.log("✓ Utilisateurs (staff + clients + chaîne de parrainage)")

  // ---------- 5. Catégories & collections ----------
  const mkCat = (name: string, slug: string, description: string, position: number, imageKey?: string) =>
    db.category.create({ data: { name, slug, description, position, imageUrl: img(imageKey ?? "")[0] ?? null } })
  const electronique = await mkCat("Électronique", "electronique", "Smartphones, audio, objets connectés et informatique.", 1, "05-smartwatch")
  const mode = await mkCat("Mode & Accessoires", "mode-accessoires", "Vêtements, sacs, chaussures et bijoux.", 2, "04-handbag")
  const maison = await mkCat("Maison & Cuisine", "maison-cuisine", "Équipement maison, cuisine et décoration.", 3, "06-coffee")
  const beaute = await mkCat("Beauté & Soins", "beaute-soins", "Parfums, soins de la peau et bien-être.", 4, "09-shea")
  const numerique = await mkCat("Produits numériques", "produits-numeriques", "Ebooks, formations et ressources téléchargeables.", 5, "13-ebook")
  const sport = await mkCat("Sport & Fitness", "sport-fitness", "Équipement sportif et bien-être.", 6, "18-yoga")

  const collectionNewTech = await db.collection.create({ data: { name: "Tech Nouveautés", slug: "tech-nouveautes", description: "Les dernières sorties électroniques.", isFeatured: true, position: 1 } })
  const collectionBest = await db.collection.create({ data: { name: "Best-sellers", slug: "best-sellers", description: "Les préférés de nos clients.", isFeatured: true, position: 2 } })
  const collectionBudget = await db.collection.create({ data: { name: "Petits prix malins", slug: "petits-prix", description: "De bonnes affaires sous 20 000 FCFA.", position: 3 } })

  // ---------- 6. Produits ----------
  interface ProductSeed {
    key: string; name: string; slug: string; type: "PHYSICAL" | "DIGITAL" | "HYBRID"
    price: number; salePrice?: number; stock?: number; sku: string
    shortDescription: string; description: string; imagesKey?: string; category: string
    featured?: boolean; tags?: string[]; digital?: { fileName: string; displayName: string }
    variants?: { name: string; options: Record<string, string>; stock: number; price?: number }[]
  }

  const products: ProductSeed[] = [
    { key: "smartphone", name: "Smartphone Nova X5 Pro 256 Go", slug: "smartphone-nova-x5-pro", type: "PHYSICAL", price: 189000, salePrice: 164900, stock: 14, sku: "ELEC-NX5-256", imagesKey: "01-smartphone", category: electronique.id, featured: true, shortDescription: "Écran AMOLED 6,7\", 8 Go RAM, 256 Go, batterie 5000 mAh, charge 45W.", description: "Le Nova X5 Pro combine performance et élégance : processeur octa-cœur, écran AMOLED 120 Hz et photo 108 Mpx.\n\nLa batterie 5000 mAh vous accompagne toute la journée, avec charge rapide 45W (0→80 % en 35 min).\n\nLivré avec chargeur, câble USB-C, coque de protection et garantie constructeur 12 mois.", tags: ["smartphone", "android", "photo"] },
    { key: "earbuds", name: "Écouteurs sans fil AirSound Pods", slug: "ecouteurs-airsound-pods", type: "PHYSICAL", price: 24900, salePrice: 18900, stock: 48, sku: "ELEC-ASR-01", imagesKey: "02-earbuds", category: electronique.id, featured: true, shortDescription: "Réduction de bruit active, 36h d'autonomie, étui de charge.", description: "Un son puissant et équilibré avec réduction de bruit active (ANC) pour vous isoler du tumulte urbain.\n\nJusqu'à 36 heures d'écoute avec l'étui de charge. Bluetooth 5.3, résistants aux éclaboussures IPX5.\n\nIdéaux pour le travail, le sport et les trajets.", tags: ["audio", "bluetooth"] },
    { key: "smartwatch", name: "Montre connectée FitWatch Pro", slug: "montre-fitwatch-pro", type: "PHYSICAL", price: 34500, stock: 22, sku: "ELEC-FWP-02", imagesKey: "05-smartwatch", category: electronique.id, shortDescription: "Suivi santé complet, GPS, 14 jours d'autonomie.", description: "Suivez vos pas, votre sommeil, votre fréquence cardiaque et votre SpO2 avec précision.\n\nÉcran AMOLED lumineux, plus de 100 modes sportifs et notifications intelligentes.\n\nAutonomie jusqu'à 14 jours en usage classique.", tags: ["montre", "sport"] },
    { key: "speaker", name: "Enceinte Bluetooth BoomBox Mini", slug: "enceinte-boombox-mini", type: "PHYSICAL", price: 18000, stock: 30, sku: "ELEC-BBM-03", imagesKey: "12-speaker", category: electronique.id, shortDescription: "Son 360°, étanche IPX7, 20h d'autonomie.", description: "Une enceinte compacte au son étonnamment puissant (20W), diffusion 360°.\n\nÉtanche IPX7 : parfaite pour la plage et la douche. Appairez deux enceintes pour un son stéréo.\n\n20 heures d'autonomie et appels mains libres.", tags: ["audio", "party"] },
    { key: "powerbank", name: "Batterie externe PowerVolt 20 000 mAh", slug: "powerbank-powervolt-20k", type: "PHYSICAL", price: 15500, salePrice: 12900, stock: 60, sku: "ELEC-PV20-04", imagesKey: "16-powerbank", category: electronique.id, shortDescription: "20 000 mAh, charge rapide 22,5W, 3 ports.", description: "Rechargez votre smartphone jusqu'à 5 fois grâce aux 20 000 mAh.\n\nCharge rapide 22,5W et trois sorties (2 USB-A + USB-C PD) pour alimenter plusieurs appareils simultanément.\n\nAffichage LED du niveau de batterie.", tags: ["chargeur", "voyage"] },
    { key: "laptop", name: "Ordinateur portable UltraBook 14 (16 Go / 512 Go SSD)", slug: "ultrabook-14-512", type: "PHYSICAL", price: 489000, stock: 6, sku: "ELEC-UB14-05", imagesKey: "10-laptop", category: electronique.id, shortDescription: "Intel Core i5, 16 Go RAM, SSD 512 Go, écran 14\" Full HD.", description: "L'UltraBook 14 est taillé pour la productivité : processeur Intel Core i5 12e génération, 16 Go de RAM et SSD NVMe 512 Go.\n\nÉcran Full HD antireflet, châssis aluminium 1,3 kg et autonomie réelle de 10 heures.\n\nWindows 11 Pro préinstallé. Clavier rétroéclairé AZERTY.", tags: ["informatique", "bureautique"] },
    { key: "headphones", name: "Casque Bluetooth StudioMax ANC", slug: "casque-studiomax-anc", type: "PHYSICAL", price: 52000, stock: 15, sku: "ELEC-SMA-06", imagesKey: "23-headphones", category: electronique.id, shortDescription: "Casque ANC hybride, 40h d'autonomie.", description: "Immergez-vous dans votre musique avec l'annulation de bruit hybride 4 micros.\n\nCoussinets mémoire de forme, pliable et léger (240 g), 40 heures d'écoute.\n\nMode filaire 3,5 mm inclus pour les longs voyages.", tags: ["audio", "premium"] },
    { key: "case", name: "Coque Protect+ pour Nova X5", slug: "coque-protect-nova-x5", type: "PHYSICAL", price: 4900, stock: 80, sku: "ELEC-CX5-07", imagesKey: "01-smartphone", category: electronique.id, shortDescription: "Coque renforcée anti-choc, compatible Nova X5 Pro.", description: "Protection militaire anti-choc pour votre Nova X5 Pro : rebords surélevés pour l'objectif et l'écran.\n\nToucher soft-touch et accès complet aux ports.\n\nDisponible en noir et transparent.", tags: ["accessoire"] },
    { key: "glass", name: "Verre trempé ShieldGlass (pack de 2)", slug: "verre-trempe-shieldglass", type: "PHYSICAL", price: 6900, stock: 90, sku: "ELEC-SGL-08", imagesKey: "17-sunglasses", category: electronique.id, shortDescription: "Dureté 9H, installation sans bulles, kit complet.", description: "Protégez votre écran des rayures et des chutes avec le verre trempé ShieldGlass 9H.\n\nLe kit inclut lingettes de nettoyage, adhésifs anti-poussière et cadres d'alignement pour une pose parfaite.\n\nCompatible Nova X5 Pro et la plupart des smartphones 6,7\".", tags: ["accessoire", "protection"] },
    { key: "dress", name: "Robe Wax Élégance (confection locale)", slug: "robe-wax-elegance", type: "PHYSICAL", price: 28000, salePrice: 22400, stock: 25, sku: "MODE-RWE-01", imagesKey: "03-dress", category: mode.id, featured: true, shortDescription: "Tissu wax authentique, coupe cintrée, confection artisanale.", description: "Une robe en véritable tissu wax, confectionnée par nos couturières partenaires à Abidjan.\n\nCoupe cintrée flatteuse, doublure coton respirant et fermeture invisible.\n\nChaque pièce est unique : de légères variations de motif sont possibles.", tags: ["wax", "local", "robe"], variants: [ { name: "Taille S", options: { Taille: "S" }, stock: 6 }, { name: "Taille M", options: { Taille: "M" }, stock: 10 }, { name: "Taille L", options: { Taille: "L" }, stock: 7 }, { name: "Taille XL", options: { Taille: "XL" }, stock: 2 } ] },
    { key: "handbag", name: "Sac à main Ambre Cuir véritable", slug: "sac-ambre-cuir", type: "PHYSICAL", price: 45000, stock: 12, sku: "MODE-SAC-02", imagesKey: "04-handbag", category: mode.id, shortDescription: "Cuir pleine fleur, poche zippée intérieure, bandoulière.", description: "Un intemporel en cuir pleine fleur au grain naturel, cousu main.\n\nUn compartiment principal spacieux, une poche zippée et une bandoulière amovible réglable.\n\nSe patine avec élégance au fil du temps.", tags: ["sac", "cuir"] },
    { key: "sneakers", name: "Baskets UrbanStep Color", slug: "baskets-urbanstep", type: "PHYSICAL", price: 39000, salePrice: 32900, stock: 35, sku: "MODE-BAS-03", imagesKey: "11-sneakers", category: mode.id, shortDescription: "Sneakers légères, semelle amortissante, look urbain.", description: "Confort toute la journée grâce à la semelle EVA amortissante et au mesh respirant.\n\nMaintien renforcé du talon et lacets plats premium.\n\nEntretien facile : surface résistante aux taches.", tags: ["chaussures", "sport"], variants: [ { name: "Taille 39", options: { Taille: "39" }, stock: 5 }, { name: "Taille 40", options: { Taille: "40" }, stock: 8 }, { name: "Taille 41", options: { Taille: "41" }, stock: 10 }, { name: "Taille 42", options: { Taille: "42" }, stock: 8 }, { name: "Taille 43", options: { Taille: "43" }, stock: 4 } ] },
    { key: "sunglasses", name: "Lunettes de soleil Solaris polarisées", slug: "lunettes-solaris", type: "PHYSICAL", price: 14500, stock: 40, sku: "MODE-LUN-04", imagesKey: "17-sunglasses", category: mode.id, shortDescription: "Verres polarisés UV400, monture acétate.", description: "Verres polarisés catégorie 3 UV400 : élimine les reflets éblouissants.\n\nMonture acétate légère et charnières renforcées, étui rigide et chiffon inclus.\n\nUn style rétro intemporel qui va à tous les visages.", tags: ["lunettes", "été"] },
    { key: "coffeemachine", name: "Machine à café expresso BaristaOne", slug: "machine-cafe-baristaone", type: "PHYSICAL", price: 129000, salePrice: 109000, stock: 8, sku: "MAIS-BO-01", imagesKey: "06-coffee", category: maison.id, featured: true, shortDescription: "15 bars, buse vapeur, double filtre — café d'exception à la maison.", description: "Extrayez des expressos riches en crème avec la pression professionnelle de 15 bars.\n\nBuse vapeur pour latte art, chauffe rapide en 40 secondes et réservoir 1,6 L.\n\nInclus : portafiltre double, 2 filtres inox et pot à lait.", tags: ["café", "cuisine"] },
    { key: "capsules", name: "Capsules Arabica Bio ×50 (compatibles)", slug: "capsules-arabica-bio-50", type: "PHYSICAL", price: 14900, stock: 55, sku: "MAIS-CA-02", imagesKey: "22-tea", category: maison.id, shortDescription: "Café arabica bio intensité 8, torréfaction artisanale.", description: "Un arabica pur origine Éthiopie, torréfié artisanalement puis conditionné en capsules compatibles Nespresso®.\n\nIntensité 8, notes de cacao et fruits secs. 50 capsules par sachet refermable.\n\n100 % bio et équitable.", tags: ["café", "bio"] },
    { key: "blender", name: "Blender MixPro 1200W", slug: "blender-mixpro-1200", type: "PHYSICAL", price: 54900, stock: 18, sku: "MAIS-BL-03", imagesKey: "07-blender", category: maison.id, shortDescription: "Moteur 1200W, bol 1,8L sans BPA, 6 lames inox.", description: "Mixez, broyez et préparez smoothies, jus de bissap et bouillies en quelques secondes.\n\nMoteur 1200 W et 6 lames en inox trempé. Bol Tritan 1,8 L sans BPA.\n\nGrand bol + mini broyeur épices inclus, avec livret de recettes locales.", tags: ["cuisine", "smoothie"] },
    { key: "solarlamp", name: "Lampe solaire SolarLight Zen", slug: "lampe-solaire-solarlight-zen", type: "PHYSICAL", price: 18500, stock: 45, sku: "MAIS-LS-04", imagesKey: "21-solarlamp", category: maison.id, shortDescription: "Recharge solaire USB, 3 intensités, 20h d'éclairage.", description: "Une lampe robuste pensée pour les coupures de courant : recharge solaire ou USB-C.\n\n3 intensités jusqu'à 300 lumens, autonomie 20 heures, poignée amovible pratique.\n\nIdéale maison, terrasse et déplacements.", tags: ["solaire", "énergie"] },
    { key: "perfume", name: "Parfum Nuit d'Ambre 50 ml", slug: "parfum-nuit-d-ambre", type: "PHYSICAL", price: 59000, salePrice: 49000, stock: 20, sku: "BEAU-PA-01", imagesKey: "08-perfume", category: beaute.id, shortDescription: "Eau de parfum boisée ambrée — oud et vanille.", description: "Une signature olfactive envoûtante : ouverture bergamote et safran, cœur oud et ambre, fond vanille-musc.\n\nConcentration eau de parfum (20 %) longue tenue.\n\nFlacon rechargeable 50 ml avec vaporisateur.", tags: ["parfum", "luxe"] },
    { key: "sheabutter", name: "Beurre de karité pur 250 g", slug: "beurre-karite-pur-250g", type: "PHYSICAL", price: 8500, stock: 70, sku: "BEAU-BK-02", imagesKey: "09-shea", category: beaute.id, shortDescription: "100 % karité brut non raffiné, coopérative féminine au Burkina.", description: "Un beurre de karité brut, non raffiné, riche en vitamines A, E et F.\n\nHydrate intensément la peau, apaise les irritations et nourrit les cheveux.\n\nIssu du commerce équitable direct auprès d'une coopérative féminine au Burkina Faso.", tags: ["karité", "bio", "cheveux"] },
    { key: "bissap", name: "Infusion Bissap Royal Bio (séchée, 200 g)", slug: "infusion-bissap-royal-bio", type: "PHYSICAL", price: 6500, stock: 65, sku: "BEAU-BI-03", imagesKey: "22-tea", category: beaute.id, shortDescription: "Fleurs d'hibiscus séchées bio, riches en antioxydants.", description: "Fleurs d'hibiscus sabdariffa soigneusement séchées, cultivées en agriculture biologique au Sénégal.\n\nInfusion délicieusement acidulée, rafraîchissante, traditionnellement appréciée pour la tension et la digestion.\n\n200 g (environ 40 tasses). À conserver au sec.", tags: ["bissap", "bio", "infusion"] },
    { key: "ebook", name: "Ebook « Marketing Digital pour Entrepreneurs Africains »", slug: "ebook-marketing-digital-afrique", type: "DIGITAL", price: 9900, salePrice: 7900, stock: 0, sku: "NUM-EK-01", imagesKey: "13-ebook", category: numerique.id, featured: true, shortDescription: "Guide PDF 120 pages : WhatsApp, réseaux sociaux et pub à petit budget.", description: "Un guide pratique écrit par des entrepreneurs africains, pour l'Afrique.\n\n120 pages : stratégie WhatsApp Business, Instagram/TikTok à petit budget, publicité locale rentable, e-mail marketing simple.\n\nFormats : PDF optimisé mobile + checklist d'action. Téléchargement immédiat après confirmation du paiement.", tags: ["ebook", "marketing"], digital: { fileName: "ebook-marketing-digital.pdf", displayName: "Marketing Digital pour Entrepreneurs Africains.pdf" } },
    { key: "course", name: "Masterclass « E-commerce Pro » (vidéo + PDF)", slug: "masterclass-ecommerce-pro", type: "DIGITAL", price: 34900, stock: 0, sku: "NUM-FR-02", imagesKey: "14-course", category: numerique.id, shortDescription: "Lancer sa boutique rentable en 30 jours (guide PDF + ressources).", description: "La méthode complète pour lancer une boutique rentable : choix de niche, sourcing fournisseurs, logistique locale, paiements mobiles, service client.\n\nGuide PDF structuré de 150 pages + modèle de business plan + scripts fournisseurs.\n\nMises à jour incluses à vie. Fichiers téléchargeables après confirmation du paiement.", tags: ["formation", "e-commerce"], digital: { fileName: "masterclass-ecommerce-pro.pdf", displayName: "Masterclass E-commerce Pro.pdf" } },
    { key: "templates", name: "Pack 150 Templates Canva Business", slug: "pack-150-templates-canva", type: "DIGITAL", price: 12500, salePrice: 9900, stock: 0, sku: "NUM-TP-03", imagesKey: "13-ebook", category: numerique.id, shortDescription: "150 modèles Canva : réseaux sociaux, flyers, cartes de visite.", description: "Accélérez votre communication : 150 templates Canva professionnels entièrement modifiables.\n\nPosts Instagram/Facebook/WhatsApp, flyers, cartes de visite, CV et présentations. Guide d'utilisation inclus.\n\nLicence commerciale incluse pour vos clients. Téléchargement ZIP après paiement.", tags: ["templates", "canva"], digital: { fileName: "pack-templates-canva.pdf", displayName: "Pack 150 Templates Canva Business.pdf" } },
    { key: "weatherstation", name: "Station météo connectée MétéoSmart Connect", slug: "station-meteo-meteosmart-connect", type: "HYBRID", price: 74900, stock: 10, sku: "HYB-SM-01", imagesKey: "15-weather", category: electronique.id, shortDescription: "Capteurs intérieur/extérieur + guide PDF « Mieux vivre la météo » inclus.", description: "Suivez température, humidité et prévisions sur l'écran couleur et votre smartphone.\n\nPlage de 3 capteurs, historique 12 mois, alertes gel et fortes pluies utiles pour l'agriculture.\n\nVersion hybride : la station est livrée chez vous ET le guide PDF « Mieux vivre la météo en Afrique de l'Ouest » (80 pages) est débloqué dans votre compte après confirmation du paiement.", tags: ["météo", "connecté", "hybride"], digital: { fileName: "guide-meteosmart.pdf", displayName: "Guide MétéoSmart Connect.pdf" } },
    { key: "nutriscale", name: "Balance cuisine connectée NutriScale Smart", slug: "balance-nutriscale-smart", type: "HYBRID", price: 29900, salePrice: 25900, stock: 16, sku: "HYB-NS-02", imagesKey: "07-blender", category: maison.id, shortDescription: "Balance 5kg Bluetooth + ebook nutrition « Manger sain localement » inclus.", description: "Pesez avec précision (1 g) jusqu'à 5 kg et suivez vos apports sur l'application Bluetooth.\n\nFonction tare, plateau inox lavable, batterie rechargeable.\n\nVersion hybride : inclut l'ebook PDF « Manger sain localement : 60 recettes et repères nutritionnels ouest-africains », accessible dans votre compte après paiement confirmé.", tags: ["cuisine", "santé", "hybride"], digital: { fileName: "guide-nutriscale.pdf", displayName: "Ebook NutriScale — Manger sain localement.pdf" } },
    { key: "yogamat", name: "Tapis de yoga ZenFlow antidérapant", slug: "tapis-yoga-zenflow", type: "PHYSICAL", price: 15900, stock: 28, sku: "SPOR-TY-01", imagesKey: "18-yoga", category: sport.id, shortDescription: "6 mm, double antidérapant, sangle de transport.", description: "Confort et adhérence pour yoga, pilates et exercices au sol : mousse NBR haute densité 6 mm.\n\nFace inférieure texturée antidérapante, surface facile à nettoyer.\n\nSangle de transport incluse. 183 × 61 cm.", tags: ["yoga", "fitness"] },
  ]

  const createdProducts: Record<string, { id: string; slug: string; name: string; price: number }> = {}
  for (const p of products) {
    const created = await db.product.create({
      data: {
        name: p.name, slug: p.slug, shortDescription: p.shortDescription, description: p.description,
        type: p.type, status: "ACTIVE", price: p.price, salePrice: p.salePrice ?? null, sku: p.sku,
        stock: p.type === "DIGITAL" ? 0 : (p.stock ?? 0), trackInventory: p.type !== "DIGITAL",
        imagesJson: JSON.stringify(img(p.imagesKey ?? "")),
        tagsJson: JSON.stringify(p.tags ?? []),
        isFeatured: p.featured ?? false,
        requiresShipping: p.type === "PHYSICAL" || p.type === "HYBRID",
        digitalFileUrl: p.digital?.fileName ?? null,
        digitalFileName: p.digital?.displayName ?? null,
        digitalDownloadLimit: 5,
        viewsCount: Math.floor(Math.random() * 800) + 120,
        salesCount: 0,
      },
    })
    createdProducts[p.key] = { id: created.id, slug: p.slug, name: p.name, price: p.salePrice ?? p.price }
    await db.productCategory.create({ data: { productId: created.id, categoryId: p.category } })
    if (p.variants) {
      for (const [i, v] of p.variants.entries()) {
        await db.productVariant.create({
          data: {
            productId: created.id, name: v.name, optionsJson: JSON.stringify(v.options),
            sku: `${p.sku}-${Object.values(v.options).join("-")}`, stock: v.stock, price: v.price ?? null, position: i,
          },
        })
      }
    }
  }
  await db.productCollection.createMany({
    data: [
      { productId: createdProducts.smartphone.id, collectionId: collectionNewTech.id },
      { productId: createdProducts.laptop.id, collectionId: collectionNewTech.id },
      { productId: createdProducts.weatherstation.id, collectionId: collectionNewTech.id },
      { productId: createdProducts.earbuds.id, collectionId: collectionBest.id },
      { productId: createdProducts.dress.id, collectionId: collectionBest.id },
      { productId: createdProducts.coffeemachine.id, collectionId: collectionBest.id },
      { productId: createdProducts.powerbank.id, collectionId: collectionBudget.id },
      { productId: createdProducts.sheabutter.id, collectionId: collectionBudget.id },
      { productId: createdProducts.bissap.id, collectionId: collectionBudget.id },
    ],
  })
  console.log(`✓ ${products.length} produits + variantes + collections`)

  // Fichiers numériques de démonstration (PDF valides minimaux)
  mkdirSync("storage/digital", { recursive: true })
  const makePdf = (title: string) =>
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R>>endobj\n4 0 obj<</Length ${title.length + 80}>>\nstream\nBT /F1 20 Tf 56 760 Td (${title.replace(/[()\\]/g, "")}) Tj ET\nBT /F1 11 Tf 56 730 Td (Document de demonstration - Teranga Market) Tj ET\nendstream\nendobj\ntrailer<</Root 1 0 R>>\nstartxref\n9\n%%EOF`
  for (const p of products) {
    if (p.digital) writeFileSync(`storage/digital/${p.digital.fileName}`, makePdf(p.name))
  }
  console.log("✓ Fichiers numériques de démonstration (storage/digital, hors public/)")
  // Fichier "à télécharger" pour l'upsell capsule? non — capsules = produit physique.

  // ---------- 7. Programmes parrainage ----------
  await db.referralProgram.create({
    data: {
      id: 1, name: "Parrainage Téranga", isActive: true,
      commissionType: "PERCENT", commissionValue: 5, capPerReward: 10000,
      baseCalculation: "SUBTOTAL", minOrderAmount: 10000,
      holdPeriodDays: 7, rewardMode: "STORE_CREDIT",
      terms: "Gagnez 5 % (plafonnés à 10 000 FCFA) du montant hors livraison des commandes payées de vos filleuls. La récompense est créditée sur votre portefeuille 7 jours après le paiement confirmé. Un client ne peut avoir qu'un seul parrain ; l'auto-parrainage est interdit. Les commandes annulées, échouées ou remboursées ne génèrent aucune récompense.",
      updatedAt: new Date(),
    },
  })
  await db.fullRefundProgram.create({
    data: {
      id: 1, name: "Remboursement Intégral par Parrainage", isActive: true,
      requiredReferrals: 5, requiredPaidOrdersPerReferral: 1, minOrderAmountPerReferral: 15000,
      minSourceOrderAmount: 20000, refundPercent: 100, refundCap: 60000,
      holdPeriodDays: 7, rewardMode: "STORE_CREDIT",
      terms: "Recommandez 5 nouveaux clients qui paient chacun au moins une commande admissible de 15 000 FCFA : vous êtes remboursé à 100 % (plafond 60 000 FCFA) de votre dernière commande éligible payée d'au moins 20 000 FCFA, sous forme de crédit boutique. Les commandes annulées ou remboursées sont exclues. Une même commande ne peut être remboursée qu'une fois.",
      updatedAt: new Date(),
    },
  })
  console.log("✓ Programmes parrainage (commission 5 % / remboursement intégral)")

  // ---------- 8. Coupons & promotions BXGY ----------
  const couponBienvenue = await db.coupon.create({
    data: { code: "BIENVENUE10", type: "PERCENT", value: 10, description: "10 % de bienvenue, dès 20 000 FCFA d'achat", minOrderAmount: 20000, perCustomerLimit: 1, isActive: true },
  })
  await db.coupon.create({ data: { code: "LIVRAISONOFFERTE", type: "FREE_SHIPPING", value: 0, description: "Livraison offerte dès 30 000 FCFA", minOrderAmount: 30000, isActive: true } })
  await db.coupon.create({ data: { code: "TECH5000", type: "FIXED", value: 5000, description: "-5 000 FCFA sur l'électronique dès 60 000 FCFA", appliesTo: "CATEGORIES", categoryIdsJson: JSON.stringify([electronique.id]), minOrderAmount: 60000, isActive: true } })

  await db.promotion.create({
    data: {
      name: "2 accessoires audio achetés = coque Protect+ offerte",
      description: "Achetez 2 unités d'accessoires audio (écouteurs, enceinte, casque, batterie) : recevez une coque Protect+ pour Nova X5 offerte.",
      ruleType: "BUY_X_GET_PRODUCT_FREE", requiredQty: 2, rewardQty: 1,
      rewardProductId: createdProducts.case.id,
      appliesTo: "PRODUCTS",
      productIdsJson: JSON.stringify([createdProducts.earbuds.id, createdProducts.speaker.id, createdProducts.headphones.id, createdProducts.powerbank.id]),
      priority: 10, combinable: true, badgeLabel: "1 coque offerte", isActive: true,
    },
  })
  await db.promotion.create({
    data: {
      name: "4 beurres de karité payés, le moins cher offert",
      description: "Achetez 4 pots de beurre de karité : l'unité la moins chère de votre sélection est offerte.",
      ruleType: "BUY_X_GET_Y_SAME", requiredQty: 4, rewardQty: 1,
      appliesTo: "PRODUCTS", productIdsJson: JSON.stringify([createdProducts.sheabutter.id]),
      priority: 10, combinable: true, badgeLabel: "1 pot offert", isActive: true,
    },
  })
  await db.promotion.create({
    data: {
      name: "Ebook marketing acheté = Pack Canva à -40 %",
      description: "Achetez l'ebook Marketing Digital : le Pack 150 Templates Canva vous est proposé à -40 %.",
      ruleType: "BUY_X_GET_PRODUCT_DISCOUNT", requiredQty: 1, rewardQty: 1,
      rewardProductId: createdProducts.templates.id, discountPercent: 40,
      appliesTo: "PRODUCTS", productIdsJson: JSON.stringify([createdProducts.ebook.id]),
      priority: 10, combinable: true, badgeLabel: "Pack Canva -40 %", isActive: true,
    },
  })
  console.log("✓ Coupons & promotions BXGY")

  // ---------- 9. Upsells ----------
  await db.upsellOffer.createMany({
    data: [
      { name: "Protégez votre écran à prix réduit", triggerType: "PRODUCT", triggerProductIdsJson: JSON.stringify([createdProducts.smartphone.id]), offerProductId: createdProducts.glass.id, specialPrice: 4900, message: "Votre Nova X5 Pro mérite la meilleure protection : le pack de 2 verres trempés ShieldGlass à -29 %, ajouté à la même livraison.", isActive: true, showOnThankYou: true, position: 1 },
      { name: "Élevez vos cafés avec des capsules bio", triggerType: "PRODUCT", triggerProductIdsJson: JSON.stringify([createdProducts.coffeemachine.id]), offerProductId: createdProducts.capsules.id, specialPrice: 11900, message: "50 capsules d'arabica bio torréfié artisanalement à -20 % pour accompagner votre BaristaOne dès sa livraison.", isActive: true, showOnThankYou: true, position: 2 },
      { name: "Le pack Canva pour passer à l'action", triggerType: "PRODUCT", triggerProductIdsJson: JSON.stringify([createdProducts.ebook.id]), offerProductId: createdProducts.templates.id, specialPrice: 8900, message: "Appliquez immédiatement les stratégies de l'ebook avec les 150 templates prêts à l'emploi, à -29 %.", isActive: true, showOnThankYou: true, position: 3 },
    ],
  })
  console.log("✓ Offres upsell")

  // ---------- 10. Pages éditables ----------
  const heroImage = img("20-hero")[0] ?? ""
  const homeSections = { sections: [
    { id: "sec-hero", type: "hero", props: {
      title: "Le meilleur du shopping, livré chez vous.",
      subtitle: "Électronique, mode, maison et produits numériques — paiement à la livraison possible, parrainage payant.",
      ctaLabel: "Découvrir le catalogue", ctaHref: "/catalogue", ctaLabel2: "Gagner avec le parrainage", ctaHref2: "/account/referrals",
      image: heroImage, align: "left", overlay: 55,
    } },
    { id: "sec-usp", type: "usp-bar", props: { items: [
      { icon: "truck", title: "Livraison rapide", text: "24–72 h à Abidjan" },
      { icon: "shield", title: "Paiement flexible", text: "À la livraison ou en ligne" },
      { icon: "refresh", title: "Retours faciles", text: "7 jours pour changer d'avis" },
      { icon: "headset", title: "Support 7j/7", text: "WhatsApp & téléphone" },
    ] } },
    { id: "sec-cats", type: "categories", props: { title: "Explorez par catégorie", count: 6 } },
    { id: "sec-feat", type: "product-grid", props: { title: "Coups de cœur de la semaine", source: "featured", count: 8 } },
    { id: "sec-promo", type: "promo-banner", props: {
      title: "Promo Tech : jusqu'à -15 % sur une sélection",
      text: "Écouteurs, smartphones, machine café… Offre limitée cette semaine.",
      ctaLabel: "En profiter", ctaHref: "/catalogue?filter=promo", background: "#f59e0b", textColor: "#18181b",
    } },
    { id: "sec-new", type: "product-grid", props: { title: "Nouveautés", source: "new", count: 4 } },
    { id: "sec-digital", type: "collection-highlight", props: { title: "Ressources numériques, disponibilité immédiate", collectionSlug: "petits-prix", text: "Ebooks et formations téléchargeables dès la confirmation du paiement.", ctaLabel: "Voir les ressources numériques" } },
    { id: "sec-testi", type: "testimonials", props: { title: "Ils nous font confiance", items: [
      { name: "Mariam K.", city: "Cocody", text: "Commande passée le matin, livrée le soir ! Le paiement à la livraison m'a rassurée.", rating: 5 },
      { name: "Serge O.", city: "Yopougon", text: "L'ébook marketing est d'une qualité incroyable. Le parrainage m'a déjà rapporté 10 000 FCFA.", rating: 5 },
      { name: "Adjoa T.", city: "Bouaké", text: "Robe wax magnifique et vraiment faite main. Livraison jusqu'à Bouaké sans souci.", rating: 4 },
    ] } },
    { id: "sec-news", type: "newsletter", props: { title: "Recevez nos offres en avant-première", text: "Une sélection d'offres et de nouveautés, une fois par semaine.", ctaLabel: "S'inscrire" } },
  ] }
  const homePage = await db.page.create({
    data: { slug: "home", title: "Page d'accueil", isPublished: true, isSystem: true, publishedData: JSON.stringify(homeSections), draftData: JSON.stringify(homeSections), publishedAt: daysAgo(3) },
  })
  await db.pageVersion.create({ data: { pageId: homePage.id, version: 1, label: "Version initiale", data: JSON.stringify(homeSections), createdAt: daysAgo(3) } })

  const mkPage = async (slug: string, title: string, sections: object) => {
    const page = await db.page.create({ data: { slug, title, isPublished: true, publishedData: JSON.stringify(sections), draftData: JSON.stringify(sections) } })
    await db.pageVersion.create({ data: { pageId: page.id, version: 1, label: "Initial", data: JSON.stringify(sections) } })
    return page
  }
  await mkPage("faq", "FAQ — Questions fréquentes", { sections: [
    { id: "faq-1", type: "faq", props: { title: "Questions fréquentes", items: [
      { q: "Puis-je payer à la livraison ?", a: "Oui ! Le paiement à la livraison est disponible dans toutes nos zones. Vous réglez en espèces à réception, et un reçu vous est remis." },
      { q: "Comment fonctionne le parrainage ?", a: "Partagez votre code depuis votre compte. Quand un filleul paie une commande éligible, vous recevez 5 % en crédit boutique. Avec 5 filleuls qualifiés, votre commande éligible peut être remboursée à 100 %." },
      { q: "Quand aurai-je accès à mes fichiers numériques ?", a: "Immédiatement après la confirmation du paiement de votre commande. Rendez-vous dans Mon compte → Téléchargements." },
      { q: "Quels sont les délais de livraison ?", a: "24 à 72 h à Abidjan selon la zone, 2 à 5 jours pour l'intérieur du pays. Les délais sont affichés au choix de votre zone." },
      { q: "Comment être remboursé ?", a: "Les remboursements se font en crédit boutique (immédiat) ou par virement validé par notre équipe. Les commandes remboursées annulent les accès numériques et récompenses associées." },
    ] } },
  ] })
  await mkPage("a-propos", "À propos de Téranga Market", { sections: [
    { id: "ap-1", type: "rich-text", props: { title: "Notre mission", html: "<p><strong>Téranga</strong> signifie hospitalité en wolof. Notre mission : rendre le e-commerce <em>simple, sûr et humain</em> en Afrique de l'Ouest.</p><p>Nous sélectionnons des produits vérifiés, valorisons les artisans locaux et offrons le paiement à la livraison pour que vous achetiez en confiance.</p>" } },
    { id: "ap-2", type: "logos", props: { title: "Ils nous accompagnent", items: [{ name: "Made in CI" }, { name: "CCIA Abidjan" }, { name: "Wave" }, { name: "Orange Money" }] } },
  ] })
  await mkPage("cgv", "Conditions générales de vente", { sections: [
    { id: "cgv-1", type: "rich-text", props: { title: "CGV (extrait)", html: "<p>Les prix sont indiqués en FCFA toutes taxes comprises. Le paiement à la livraison est encaissé par le livreur.</p><p>Les produits numériques sont accessibles après confirmation du paiement, dans la limite de 5 téléchargements.</p><p>Retours acceptés sous 7 jours pour les produits physiques non ouverts.</p>" } },
  ] })
  await mkPage("livraison", "Livraison & retours", { sections: [
    { id: "liv-1", type: "faq", props: { title: "Livraison & retours", items: [
      { q: "Frais de livraison", a: "1 000–1 500 FCFA selon la zone à Abidjan, 2 500 FCFA grand Abidjan, 3 500 FCFA intérieur. Livraison OFFERTE dès 50 000 FCFA." },
      { q: "Retours", a: "Vous disposez de 7 jours pour retourner un produit physique non utilisé. Contactez le support pour lancer un retour." },
      { q: "Suivi", a: "Suivez votre commande depuis votre compte, rubrique « Mes commandes »." },
    ] } },
  ] })
  console.log("✓ Pages éditables (accueil, FAQ, à propos, CGV, livraison)")

  // ---------- 11. Commandes réalistes sur 45 jours ----------
  const ordersSeed: {
    user: string; days: number; status: string; paymentStatus: string
    items: { key: string; qty: number; variant?: string }[]; zoneIdx: number
    coupon?: string; note?: string; cancelledReason?: string; refunded?: boolean
  }[] = [
    { user: kwame.id, days: 42, status: "DELIVERED", paymentStatus: "PAYMENT_PAID", items: [{ key: "earbuds", qty: 2 }, { key: "powerbank", qty: 1 }], zoneIdx: 1, coupon: "BIENVENUE10" },
    { user: fatou2.id, days: 38, status: "DELIVERED", paymentStatus: "PAYMENT_PAID", items: [{ key: "dress", qty: 1, variant: "Taille M" }, { key: "sheabutter", qty: 2 }], zoneIdx: 0 },
    { user: moussa.id, days: 34, status: "DELIVERED", paymentStatus: "PAYMENT_PAID", items: [{ key: "solarlamp", qty: 2 }], zoneIdx: 3 },
    { user: aminata.id, days: 30, status: "DELIVERED", paymentStatus: "PAYMENT_PAID", items: [{ key: "coffeemachine", qty: 1 }, { key: "capsules", qty: 2 }], zoneIdx: 0 },
    { user: kwame.id, days: 24, status: "DELIVERED", paymentStatus: "PAYMENT_PAID", items: [{ key: "smartwatch", qty: 1 }], zoneIdx: 1 },
    { user: fatou2.id, days: 18, status: "DELIVERED", paymentStatus: "PAYMENT_PAID", items: [{ key: "ebook", qty: 1 }], zoneIdx: 0 },
    { user: moussa.id, days: 12, status: "DELIVERED", paymentStatus: "PAYMENT_PAID", items: [{ key: "bissap", qty: 3 }, { key: "sheabutter", qty: 4 }], zoneIdx: 3, coupon: "BIENVENUE10" },
    { user: aminata.id, days: 9, status: "SHIPPED", paymentStatus: "PAYMENT_PAID", items: [{ key: "smartphone", qty: 1 }], zoneIdx: 0, note: "Livraison avant 18h souhaitée" },
    { user: kwame.id, days: 6, status: "CONFIRMED", paymentStatus: "PAYMENT_PAID", items: [{ key: "course", qty: 1 }], zoneIdx: 1 },
    { user: fatou2.id, days: 5, status: "CONFIRMED", paymentStatus: "PAYMENT_PAID", items: [{ key: "perfume", qty: 1 }, { key: "sunglasses", qty: 1 }], zoneIdx: 0 },
    { user: moussa.id, days: 3, status: "PENDING", paymentStatus: "PAYMENT_PENDING", items: [{ key: "blender", qty: 1 }], zoneIdx: 3 },
    { user: kwame.id, days: 2, status: "PENDING", paymentStatus: "PAYMENT_PENDING", items: [{ key: "sneakers", qty: 1, variant: "Taille 42" }], zoneIdx: 1 },
    { user: fatou2.id, days: 10, status: "CANCELLED", paymentStatus: "PAYMENT_CANCELLED", items: [{ key: "handbag", qty: 1 }], zoneIdx: 0, cancelledReason: "Client injoignable à 3 reprises" },
    { user: aminata.id, days: 21, status: "REFUNDED", paymentStatus: "PAYMENT_REFUNDED", items: [{ key: "headphones", qty: 1 }], zoneIdx: 0, refunded: true, note: "Produit reçu défectueux" },
    { user: moussa.id, days: 1, status: "PROCESSING", paymentStatus: "PAYMENT_PAID", items: [{ key: "weatherstation", qty: 1 }], zoneIdx: 3 },
  ]

  const createdOrders: { id: string; orderNumber: string; userId: string; status: string; paymentStatus: string; total: number; subtotal: number; paid: boolean; days: number }[] = []
  let orderSeq = 1
  const audioSlugs = ["ecouteurs-airsound-pods", "enceinte-boombox-mini", "casque-studiomax-anc", "powerbank-powervolt-20k"]

  for (const o of ordersSeed) {
    const zone = zones[o.zoneIdx]
    const user = await db.user.findUniqueOrThrow({ where: { id: o.user } })

    const items: { productId: string; name: string; slug: string; sku: string | null; unitPrice: number; qty: number; type: string; isFree: boolean; digital: string | null; variantId: string | null; variantName: string | null }[] = []
    let subtotal = 0
    for (const it of o.items) {
      const prod = await db.product.findFirstOrThrow({ where: { slug: createdProducts[it.key].slug } })
      let variantRow: { id: string; name: string; sku: string | null; price: number | null; stock: number } | null = null
      if (it.variant) variantRow = await db.productVariant.findFirst({ where: { productId: prod.id, name: it.variant } })
      const unit = variantRow?.price ?? prod.salePrice ?? prod.price
      items.push({ productId: prod.id, name: prod.name, slug: prod.slug, sku: variantRow?.sku ?? prod.sku, unitPrice: unit, qty: it.qty, type: prod.type, isFree: false, digital: prod.digitalFileUrl, variantId: variantRow?.id ?? null, variantName: variantRow?.name ?? null })
      subtotal += unit * it.qty
    }
    let promotionDiscount = 0
    if (items.filter((i) => audioSlugs.includes(i.slug)).reduce((s, i) => s + i.qty, 0) >= 2) {
      const caseProd = await db.product.findFirstOrThrow({ where: { slug: "coque-protect-nova-x5" } })
      items.push({ productId: caseProd.id, name: caseProd.name, slug: caseProd.slug, sku: caseProd.sku, unitPrice: caseProd.salePrice ?? caseProd.price, qty: 1, type: caseProd.type, isFree: true, digital: null, variantId: null, variantName: null })
      promotionDiscount = caseProd.salePrice ?? caseProd.price
    }
    const couponRow = o.coupon ? couponBienvenue : null
    const couponDiscount = couponRow ? Math.round(subtotal * 0.1) : 0
    const shippingCost = subtotal - couponDiscount >= 50000 ? 0 : zone.baseCost
    const total = subtotal - couponDiscount + shippingCost
    const createdAt = daysAgo(o.days)
    const paid = o.paymentStatus === "PAYMENT_PAID"
    const orderNumber = `TM-${String(createdAt.getFullYear()).slice(2)}${String(createdAt.getMonth() + 1).padStart(2, "0")}${String(createdAt.getDate()).padStart(2, "0")}-${String(orderSeq++).padStart(4, "0")}`

    const order = await db.order.create({
      data: {
        orderNumber, accessToken: randomBytes(16).toString("hex"), userId: user.id,
        customerName: user.name, customerEmail: user.email, customerPhone: user.phone ?? "",
        address: user.address ?? "Adresse de démonstration", city: user.city ?? "Abidjan",
        shippingZoneId: zone.id, shippingZoneName: zone.name, shippingCost,
        subtotal, couponId: couponRow?.id, couponCode: couponRow?.code, couponDiscount,
        promotionsJson: JSON.stringify(promotionDiscount > 0 ? [{ promotionId: "seed", name: "2 accessoires audio → coque offerte", amount: promotionDiscount, description: "Coque Protect+ offerte" }] : []),
        promotionDiscount, total, amountPaid: paid ? total : 0,
        paymentMethodCode: "cash_on_delivery", paymentMethodLabel: "Paiement à la livraison",
        referrerId: user.referredById ?? null,
        orderStatus: o.status, paymentStatus: o.paymentStatus,
        deliveryNote: o.note, adminNote: o.cancelledReason,
        paidAt: paid ? daysAgo(Math.max(0, o.days - 1), 6) : null,
        confirmedAt: paid ? daysAgo(Math.max(0, o.days - 1), 7) : null,
        shippedAt: ["SHIPPED", "DELIVERED"].includes(o.status) ? daysAgo(Math.max(0, o.days - 1), 8) : null,
        deliveredAt: o.status === "DELIVERED" ? daysAgo(Math.max(0, o.days - 2), 9) : null,
        cancelledAt: o.status === "CANCELLED" ? daysAgo(Math.max(0, o.days - 1), 8) : null,
        createdAt, updatedAt: createdAt,
      },
    })

    const createdItems: { id: string; productId: string; type: string; digital: string | null }[] = []
    for (const i of items) {
      const orderItem = await db.orderItem.create({
        data: {
          orderId: order.id, productId: i.productId, variantId: i.variantId, variantName: i.variantName,
          productName: i.name, productSlug: i.slug, sku: i.sku,
          unitPrice: i.unitPrice, quantity: i.qty, lineTotal: i.isFree ? 0 : i.unitPrice * i.qty,
          isFreeItem: i.isFree,
        },
      })
      createdItems.push({ id: orderItem.id, productId: i.productId, type: i.type, digital: i.digital })
    }

    await db.payment.create({
      data: { orderId: order.id, provider: "cash_on_delivery", methodLabel: "Paiement à la livraison", amount: total, status: o.paymentStatus, confirmedAt: paid ? daysAgo(Math.max(0, o.days - 1), 6) : null, confirmedBy: paid ? "Ibrahim Koné" : null, createdAt },
    })

    if (couponRow) {
      await db.couponRedemption.create({ data: { couponId: couponRow.id, userId: user.id, orderId: order.id, createdAt } })
      await db.coupon.update({ where: { id: couponRow.id }, data: { usedCount: { increment: 1 } } })
    }

    const events: { type: string; message: string; at: Date; actorName?: string }[] = [
      { type: "created", message: `Commande créée (${total} FCFA) — paiement à la livraison.`, at: createdAt, actorName: user.name },
    ]
    if (paid) events.push({ type: "payment_confirmed", message: "Paiement confirmé en espèces à la livraison.", at: daysAgo(Math.max(0, o.days - 1), 6), actorName: "Ibrahim Koné" })
    if (["SHIPPED", "DELIVERED"].includes(o.status)) events.push({ type: "shipped", message: "Colis confié au livreur.", at: daysAgo(Math.max(0, o.days - 1), 8), actorName: "Koffi Yao" })
    if (o.status === "DELIVERED") events.push({ type: "delivered", message: "Commande livrée et encaissée.", at: daysAgo(Math.max(0, o.days - 2), 9), actorName: "Koffi Yao" })
    if (o.status === "CANCELLED") events.push({ type: "cancelled", message: `Commande annulée : ${o.cancelledReason}`, at: daysAgo(Math.max(0, o.days - 1), 8), actorName: "Ibrahim Koné" })
    if (o.status === "REFUNDED") events.push({ type: "refunded", message: "Remboursement intégral en crédit boutique (produit défectueux).", at: daysAgo(Math.max(0, o.days - 3), 10), actorName: "Ibrahim Koné" })
    if (o.status === "PROCESSING") events.push({ type: "processing", message: "Commande en préparation.", at: daysAgo(0, 3), actorName: "Koffi Yao" })
    for (const e of events) {
      await db.orderEvent.create({ data: { orderId: order.id, type: e.type, message: e.message, actorName: e.actorName ?? "Système", createdAt: e.at } })
    }

    if (paid) {
      for (const ci of createdItems) {
        if ((ci.type === "DIGITAL" || ci.type === "HYBRID") && ci.digital && order.userId) {
          await db.digitalDownloadGrant.create({ data: { orderItemId: ci.id, userId: order.userId, limitCount: 5, downloadCount: Math.floor(Math.random() * 2), createdAt: daysAgo(Math.max(0, o.days - 1), 6) } })
          await db.orderItem.update({ where: { id: ci.id }, data: { digitalGranted: true } })
        }
      }
    }

    if (o.refunded && order.userId) {
      await db.refund.create({ data: { orderId: order.id, amount: total, mode: "STORE_CREDIT", status: "PROCESSED", reason: "Produit défectueux", createdById: admin.id, processedAt: daysAgo(Math.max(0, o.days - 3), 10), createdAt: daysAgo(Math.max(0, o.days - 3), 10) } })
      const u = await db.user.findUniqueOrThrow({ where: { id: order.userId } })
      await db.creditTransaction.create({ data: { userId: order.userId, amount: total, type: "REFUND", description: `Remboursement de la commande ${orderNumber} (produit défectueux)`, balanceAfter: (u.storeCredit ?? 0) + total, orderId: order.id, createdAt: daysAgo(Math.max(0, o.days - 3), 10) } })
      await db.user.update({ where: { id: order.userId }, data: { storeCredit: (u.storeCredit ?? 0) + total } })
    }

    createdOrders.push({ id: order.id, orderNumber, userId: user.id, status: o.status, paymentStatus: o.paymentStatus, total, subtotal, paid, days: o.days })
  }
  console.log(`✓ ${createdOrders.length} commandes réalistes (45 jours, tous statuts)`)

  // ---------- 12. Récompenses parrainage (cohérentes avec les commandes) ----------
  const kwamePaid = createdOrders.filter((o) => o.userId === kwame.id && o.paid)
  if (kwamePaid.length >= 2) {
    const [o1, o2] = kwamePaid
    const amount1 = Math.min(Math.round(o1.subtotal * 0.05), 10000)
    const amount2 = Math.min(Math.round(o2.subtotal * 0.05), 10000)
    const r1 = await db.reward.create({
      data: {
        program: "COMMISSION", programId: 1, beneficiaryId: aminata.id, sourceOrderId: o1.id, sourceUserId: kwame.id,
        amount: amount1, status: "REWARD_AVAILABLE", uniqueKey: `commission:${o1.id}`,
        ruleSnapshotJson: JSON.stringify({ commissionType: "PERCENT", commissionValue: 5, capPerReward: 10000, rewardMode: "STORE_CREDIT", programName: "Parrainage Téranga" }),
        reason: `Commission parrainage : ${amount1} FCFA sur la commande ${o1.orderNumber} de Kwame Mensah.`,
        eligibleAt: daysAgo(Math.max(0, o1.days - 7)), approvedAt: daysAgo(Math.max(0, o1.days - 7)), createdAt: daysAgo(Math.max(0, o1.days - 1), 5),
      },
    })
    await db.creditTransaction.create({
      data: { userId: aminata.id, amount: amount1, type: "REWARD", description: `Commission parrainage (commande ${o1.orderNumber})`, balanceAfter: amount1, rewardId: r1.id, createdAt: daysAgo(Math.max(0, o1.days - 7)) },
    })
    await db.user.update({ where: { id: aminata.id }, data: { storeCredit: amount1 } })
    await db.reward.create({
      data: {
        program: "COMMISSION", programId: 1, beneficiaryId: aminata.id, sourceOrderId: o2.id, sourceUserId: kwame.id,
        amount: amount2, status: "REWARD_PENDING", uniqueKey: `commission:${o2.id}`,
        ruleSnapshotJson: JSON.stringify({ commissionType: "PERCENT", commissionValue: 5, capPerReward: 10000, rewardMode: "STORE_CREDIT", programName: "Parrainage Téranga" }),
        reason: `Commission parrainage : ${amount2} FCFA sur la commande ${o2.orderNumber} de Kwame Mensah.`,
        eligibleAt: daysAhead(3), createdAt: daysAgo(Math.max(0, o2.days - 1), 5),
      },
    })
    // Commissions de Fatou B. (filleule) : en attente
    const fatouPaid = createdOrders.filter((o) => o.userId === fatou2.id && o.paid)
    if (fatouPaid.length > 0) {
      const of1 = fatouPaid[0]
      const amountF = Math.min(Math.round(of1.subtotal * 0.05), 10000)
      await db.reward.create({
        data: {
          program: "COMMISSION", programId: 1, beneficiaryId: aminata.id, sourceOrderId: of1.id, sourceUserId: fatou2.id,
          amount: amountF, status: "REWARD_PENDING", uniqueKey: `commission:${of1.id}`,
          ruleSnapshotJson: JSON.stringify({ commissionType: "PERCENT", commissionValue: 5, capPerReward: 10000, rewardMode: "STORE_CREDIT", programName: "Parrainage Téranga" }),
          reason: `Commission parrainage : ${amountF} FCFA sur la commande ${of1.orderNumber} de Fatou Bamba.`,
          eligibleAt: daysAhead(5), createdAt: daysAgo(Math.max(0, of1.days - 1), 5),
        },
      })
    }
  }
  console.log("✓ Récompenses parrainage (available + pending, idempotence uniqueKey)")

  // ---------- 13. Avis ----------
  const reviewSeeds: { prodKey: string; user: string; author: string; rating: number; title?: string; comment: string; verified: boolean; status: string; days: number }[] = [
    { prodKey: "earbuds", user: kwame.id, author: "Kwame M.", rating: 5, title: "Excellent rapport qualité-prix", comment: "Réduction de bruit surprenante à ce prix. Les 36h d'autonomie sont réelles.", verified: true, status: "APPROVED", days: 35 },
    { prodKey: "earbuds", user: fatou2.id, author: "Fatou B.", rating: 4, title: "Très bien", comment: "Bons graves, tenue confortable. L'étui est un peu salissant.", verified: true, status: "APPROVED", days: 20 },
    { prodKey: "smartphone", user: aminata.id, author: "Aminata T.", rating: 5, title: "Un vrai flagship killer", comment: "Fluide, excellente photo de nuit, la charge rapide est magique.", verified: true, status: "APPROVED", days: 8 },
    { prodKey: "dress", user: fatou2.id, author: "Fatou B.", rating: 5, title: "Sublime et vraiment local", comment: "Coupes et finitions impeccables. Reçu plein de compliments !", verified: true, status: "APPROVED", days: 33 },
    { prodKey: "coffeemachine", user: aminata.id, author: "Aminata T.", rating: 5, title: "Un vrai barista à la maison", comment: "Crème parfaite, buse vapeur efficace pour les cappuccinos.", verified: true, status: "APPROVED", days: 26 },
    { prodKey: "sheabutter", user: fatou2.id, author: "Fatou B.", rating: 5, comment: "Texture riche, odeur naturelle. Ma peau adore.", verified: true, status: "APPROVED", days: 30 },
    { prodKey: "sheabutter", user: moussa.id, author: "Moussa C.", rating: 4, comment: "Très bon karité. Le pot est un peu petit, j'en recommande deux.", verified: true, status: "APPROVED", days: 10 },
    { prodKey: "ebook", user: kwame.id, author: "Kwame M.", rating: 5, title: "Actionnable immédiatement", comment: "Les chapitres WhatsApp Business m'ont fait doubler mes ventes.", verified: true, status: "APPROVED", days: 15 },
    { prodKey: "ebook", user: fatou2.id, author: "Fatou B.", rating: 4, comment: "Très concret, orienté marché africain. PDF très lisible sur mobile.", verified: true, status: "APPROVED", days: 6 },
    { prodKey: "smartwatch", user: kwame.id, author: "Kwame M.", rating: 4, comment: "Bon suivi santé, l'autonomie tient bien 10 jours avec GPS.", verified: true, status: "APPROVED", days: 22 },
    { prodKey: "bissap", user: moussa.id, author: "Moussa C.", rating: 5, comment: "Fleurs entières, très fraîches, l'infusion est délicieuse.", verified: true, status: "APPROVED", days: 11 },
    { prodKey: "solarlamp", user: moussa.id, author: "Moussa C.", rating: 5, comment: "Parfaite pendant les coupures, la recharge solaire fonctionne bien.", verified: true, status: "APPROVED", days: 32 },
    { prodKey: "perfume", user: fatou2.id, author: "Fatou B.", rating: 4, title: "Sillage envoûtant", comment: "Tenue de 8h sur peau. Très proche de parfums bien plus chers.", verified: true, status: "APPROVED", days: 4 },
    { prodKey: "capsules", user: aminata.id, author: "Aminata T.", rating: 5, comment: "Crème épaisse, arômes fidèles. Rapport qualité/prix imbattable.", verified: true, status: "APPROVED", days: 5 },
    { prodKey: "sneakers", user: kwame.id, author: "Kwame M.", rating: 3, title: "Correctes mais taille petit", comment: "Prenez une taille au-dessus. Confort correct au quotidien.", verified: true, status: "PENDING", days: 1 },
    { prodKey: "blender", user: moussa.id, author: "Moussa C.", rating: 5, comment: "Broye vraiment les épices et la glace sans souci.", verified: false, status: "PENDING", days: 1 },
  ]
  for (const r of reviewSeeds) {
    const prod = await db.product.findFirstOrThrow({ where: { slug: createdProducts[r.prodKey].slug } })
    await db.review.create({
      data: { productId: prod.id, userId: r.user, authorName: r.author, rating: r.rating, title: r.title ?? null, comment: r.comment, isVerifiedBuyer: r.verified, status: r.status, createdAt: daysAgo(r.days) },
    })
  }
  for (const p of Object.values(createdProducts)) {
    const reviews = await db.review.findMany({ where: { productId: p.id, status: "APPROVED" } })
    if (reviews.length > 0) {
      const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      await db.product.update({ where: { id: p.id }, data: { ratingAvg: Math.round(avg * 10) / 10, ratingCount: reviews.length } })
    }
  }
  console.log(`✓ ${reviewSeeds.length} avis (dont 2 en modération)`)

  // ---------- 14. Paniers abandonnés ----------
  const abandoned = [
    { token: "seed-abandoned-1", days: 3, userId: null as string | null, items: [{ key: "laptop", qty: 1 }, { key: "headphones", qty: 1 }] },
    { token: "seed-abandoned-2", days: 1, userId: fatou2.id, items: [{ key: "handbag", qty: 1 }, { key: "sunglasses", qty: 2 }] },
  ]
  for (const a of abandoned) {
    const cart = await db.cart.create({ data: { sessionToken: a.token, userId: a.userId, status: "ACTIVE", lastActivityAt: daysAgo(a.days), createdAt: daysAgo(a.days + 1), updatedAt: daysAgo(a.days) } })
    for (const i of a.items) {
      const prod = await db.product.findFirstOrThrow({ where: { slug: createdProducts[i.key].slug } })
      await db.cartItem.create({ data: { cartId: cart.id, productId: prod.id, quantity: i.qty, createdAt: daysAgo(a.days) } })
    }
  }
  console.log("✓ Paniers abandonnés (2)")

  // ---------- 15. Campagnes (brouillon) + newsletter + journal ----------
  await db.campaign.createMany({
    data: [
      { name: "Relance Bissap & Karité", channel: "WHATSAPP", subject: "-10 % sur vos essentiels beauté", content: "Bonjour {{prenom}} 🌿 Votre beurre de karité préféré vous attend avec -10 % pendant 48h. Code : KARITE10. — Téranga Market", audienceJson: JSON.stringify({ segment: "CUSTOMERS", minOrders: 1 }), status: "DRAFT", note: "Aucun fournisseur WhatsApp configuré : à connecter avant tout envoi réel." },
      { name: "Bienvenue nouveaux inscrits", channel: "EMAIL", subject: "Bienvenue chez Téranga Market 🎉", content: "Merci {{prenom}} ! Votre code de bienvenue BIENVENUE10 vous attend (-10 % dès 20 000 FCFA). Le paiement à la livraison est disponible.", audienceJson: JSON.stringify({ segment: "SUBSCRIBERS" }), status: "DRAFT", note: "Aucun fournisseur email configuré : à connecter avant tout envoi réel." },
    ],
  })
  await db.newsletterSubscriber.createMany({
    data: [
      { email: "ayanakone@example.com", source: "footer" },
      { email: "seydou@example.com", source: "footer" },
      { email: "mariam@example.com", source: "section" },
      { email: "bintou@example.com", source: "checkout" },
      { email: "yao@example.com", source: "footer" },
    ],
  })
  await db.activityLog.createMany({
    data: [
      { actorName: "Ibrahim Koné", actorRole: "ADMIN", action: "store.seed", entityType: "system", detailsJson: JSON.stringify({ message: "Base de démonstration initialisée" }), createdAt: daysAgo(45) },
      { actorName: "Awa Diallo", actorRole: "MARKETING", action: "coupon.create", entityType: "coupon", detailsJson: JSON.stringify({ code: "BIENVENUE10" }), createdAt: daysAgo(40) },
      { actorName: "Evrard Guehisea", actorRole: "OWNER", action: "user.create", entityType: "user", entityId: marketer.id, detailsJson: JSON.stringify({ email: "marketing@teranga.market" }), createdAt: daysAgo(44) },
    ],
  })
  console.log("✓ Campagnes (brouillon honnête), newsletter, journal d'activité")

  console.log("\n🎉 SEED TERMINÉ")
  console.log("   Boutique  : http://localhost:3000")
  console.log("   ⚠️ Mots de passe : fournis via SEED_OWNER_PASSWORD / SEED_STAFF_PASSWORD / SEED_CLIENT_PASSWORD (non affichés).")
  console.log("   ⚠️ Comptes de démo : à désactiver ou supprimer avant toute mise en production !")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
