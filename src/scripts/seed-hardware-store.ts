/**
 * Seed real data for the hardware supply store (bolts, screws, anchors, threaded rods, etc.).
 *
 * Run:    cd kami-app && medusa exec ./src/scripts/seed-hardware-store.ts
 * Reset:  cd kami-app && medusa exec ./src/scripts/seed-hardware-store.ts -- --reset
 *
 * Script self-deletes from dist after completion.
 * Idempotent — re-running skips if already seeded (unless --reset is used).
 */

import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

// ── Helpers ──────────────────────────────────────────────────────────

const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min

const pick = <T>(arr: T[], count: number): T[] => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

const pickOne = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)]

const daysAgo = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(rand(8, 18), rand(0, 59), 0, 0)
  return d
}

// ── Country codes ────────────────────────────────────────────────────

const COUNTRY = {
  VN: "vn", CN: "cn", JP: "jp", KR: "kr", TW: "tw", DE: "de", TH: "th",
}

// ── SKU code helpers ─────────────────────────────────────────────────
// Generate unique SKU per product via material + grade + origin codes
// Prevents collisions when multiple products of the same type share sizes

const materialToCode = (m: string): string => {
  if (m.includes("Carbon")) return "TC"
  if (m.includes("Inox 304") || m.includes("SUS304")) return "S4"
  if (m.includes("Inox 316") || m.includes("SUS316")) return "S6"
  if (m.includes("Zinc")) return "TZ"
  if (m.includes("Phosphate") || m.includes("Phosphat")) return "TP"
  if (m.includes("Nylon")) return "NY"
  if (m.includes("Plastic")) return "PA"
  return m.slice(0, 2).toUpperCase().replace(/[^A-Z]/g, "X")
}

const gradeToCode = (g: string): string => {
  if (g === "8.8") return "88"
  if (g === "10.9") return "X9"
  if (g === "12.9") return "Y9"
  if (g === "4.8") return "48"
  if (g === "5.8") return "58"
  if (g === "A2-70") return "2A"
  if (g === "A4-80") return "4A"
  if (g === "A2") return "A2"
  if (g === "C1022") return "C1"
  if (g === "Standard") return "ST"
  if (g === "Premium") return "CC"
  return g.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase()
}

const productSkuCode = (pdef: ProductDef): string => {
  return materialToCode(pdef.material) + gradeToCode(pdef.grade) + pdef.originCountry.toUpperCase()
}

// ── Seeded IDs (populated at runtime) ────────────────────────────────

interface SeededIds {
  regionId: string
  salesChannelId: string
  stockLocations: { main: string; secondary: string }
  categoryIds: Record<string, string>
  productTypeIds: Record<string, string>
  tagIds: Record<string, string>
  storeId: string
  shippingProfileId: string
  fulfillmentSetId: string
  serviceZoneId: string
}

const ids: SeededIds = {} as SeededIds

// ── Product definition DSL ───────────────────────────────────────────

interface ProductDef {
  title: string
  description: string
  typeKey: string
  categoryKey: string
  material: string
  originCountry: string
  originLabel: string
  grade: string
  unit: string // "kg", "box 100 pcs", "rod", "bag 50 pcs", "pcs"
  sizes: { label: string; price: number; skuSuffix: string }[]
  tags: string[]
}

// ── Product definitions ──────────────────────────────────────────────

const PRODUCTS: ProductDef[] = [
  // ═══ Hex Bolts ═══
  {
    title: "Hex Bolt Full Thread Carbon Steel 8.8",
    description:
      "Hex bolt full thread carbon steel grade 8.8, hex head external drive, DIN 933 standard. For steel structures, machinery, construction.",
    typeKey: "Hex Bolt",
    categoryKey: "bu-long-luc-giac",
    material: "Carbon Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "8.8",
    unit: "kg",
    sizes: [
      { label: "M6×20", price: 95000, skuSuffix: "M6X20" },
      { label: "M8×30", price: 120000, skuSuffix: "M8X30" },
      { label: "M10×40", price: 135000, skuSuffix: "M10X40" },
      { label: "M12×50", price: 150000, skuSuffix: "M12X50" },
      { label: "M16×60", price: 180000, skuSuffix: "M16X60" },
    ],
    tags: ["imported", "bestseller"],
  },
  {
    title: "Hex Bolt Full Thread Carbon Steel 10.9",
    description:
      "Hex bolt full thread carbon steel grade 10.9, hex head external drive, DIN 931 standard. High strength, for heavy-load structures, bridges, factories.",
    typeKey: "Hex Bolt",
    categoryKey: "bu-long-luc-giac",
    material: "Carbon Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "10.9",
    unit: "kg",
    sizes: [
      { label: "M8×30", price: 160000, skuSuffix: "M8X30" },
      { label: "M10×40", price: 180000, skuSuffix: "M10X40" },
      { label: "M12×50", price: 200000, skuSuffix: "M12X50" },
      { label: "M16×60", price: 240000, skuSuffix: "M16X60" },
      { label: "M20×80", price: 320000, skuSuffix: "M20X80" },
    ],
    tags: ["imported", "premium"],
  },
  {
    title: "Hex Bolt Full Thread Carbon Steel 12.9",
    description:
      "Hex bolt grade 12.9 — highest grade in carbon steel line. For applications requiring extreme tensile strength, heavy industrial machinery.",
    typeKey: "Hex Bolt",
    categoryKey: "bu-long-luc-giac",
    material: "Carbon Steel",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "12.9",
    unit: "kg",
    sizes: [
      { label: "M8×30", price: 220000, skuSuffix: "M8X30" },
      { label: "M10×40", price: 250000, skuSuffix: "M10X40" },
      { label: "M12×50", price: 280000, skuSuffix: "M12X50" },
      { label: "M16×60", price: 350000, skuSuffix: "M16X60" },
    ],
    tags: ["imported", "premium"],
  },
  {
    title: "Hex Bolt Full Thread Stainless Steel 304",
    description:
      "Hex bolt stainless steel 304 (SUS304), completely rust-proof. For humid environments, outdoors, marine construction, food equipment.",
    typeKey: "Hex Bolt",
    categoryKey: "bu-long-luc-giac",
    material: "Inox 304",
    originCountry: COUNTRY.JP,
    originLabel: "Japan",
    grade: "A2-70",
    unit: "kg",
    sizes: [
      { label: "M6×20", price: 200000, skuSuffix: "M6X20" },
      { label: "M8×30", price: 250000, skuSuffix: "M8X30" },
      { label: "M10×40", price: 300000, skuSuffix: "M10X40" },
      { label: "M12×50", price: 360000, skuSuffix: "M12X50" },
      { label: "M16×60", price: 450000, skuSuffix: "M16X60" },
    ],
    tags: ["imported", "premium", "bestseller"],
  },
  {
    title: "Hex Bolt Full Thread Stainless Steel 316",
    description:
      "Hex bolt stainless steel 316 (SUS316) — superior acid and saltwater resistance compared to 304. For marine, chemical, medical, harsh environments.",
    typeKey: "Hex Bolt",
    categoryKey: "bu-long-luc-giac",
    material: "Inox 316",
    originCountry: COUNTRY.JP,
    originLabel: "Japan",
    grade: "A4-80",
    unit: "kg",
    sizes: [
      { label: "M8×30", price: 380000, skuSuffix: "M8X30" },
      { label: "M10×40", price: 450000, skuSuffix: "M10X40" },
      { label: "M12×50", price: 520000, skuSuffix: "M12X50" },
      { label: "M16×60", price: 680000, skuSuffix: "M16X60" },
    ],
    tags: ["imported", "premium"],
  },
  {
    title: "Hex Bolt Full Thread Stainless Steel 304 Taiwan",
    description:
      "Hex bolt stainless steel 304 from Taiwan — high quality, more competitive pricing than Japanese stock. Suitable for residential and light industrial projects.",
    typeKey: "Hex Bolt",
    categoryKey: "bu-long-luc-giac",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2-70",
    unit: "kg",
    sizes: [
      { label: "M6×20", price: 160000, skuSuffix: "M6X20" },
      { label: "M8×30", price: 200000, skuSuffix: "M8X30" },
      { label: "M10×40", price: 240000, skuSuffix: "M10X40" },
      { label: "M12×50", price: 280000, skuSuffix: "M12X50" },
      { label: "M16×60", price: 350000, skuSuffix: "M16X60" },
    ],
    tags: ["imported", "bestseller"],
  },
  {
    title: "Hex Bolt Full Thread Electro-Zinc-Plated Steel",
    description:
      "Hex bolt carbon steel electro-zinc-plated (white zinc). Good rust resistance in normal environments, budget-friendly. For interiors, general mechanical use.",
    typeKey: "Hex Bolt",
    categoryKey: "bu-long-luc-giac",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "4.8",
    unit: "kg",
    sizes: [
      { label: "M6×20", price: 70000, skuSuffix: "M6X20" },
      { label: "M8×30", price: 85000, skuSuffix: "M8X30" },
      { label: "M10×40", price: 95000, skuSuffix: "M10X40" },
      { label: "M12×50", price: 110000, skuSuffix: "M12X50" },
      { label: "M16×60", price: 140000, skuSuffix: "M16X60" },
    ],
    tags: ["imported", "budget"],
  },
  {
    title: "Hex Bolt Full Thread Hot-Dip Galvanized Steel",
    description:
      "Hex bolt carbon steel hot-dip galvanized (HDG). Excellent rust protection for outdoor structures, power stations, bridges. 50-80 micron coating thickness.",
    typeKey: "Hex Bolt",
    categoryKey: "bu-long-luc-giac",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.VN,
    originLabel: "Vietnam",
    grade: "8.8",
    unit: "kg",
    sizes: [
      { label: "M10×40", price: 140000, skuSuffix: "M10X40" },
      { label: "M12×50", price: 160000, skuSuffix: "M12X50" },
      { label: "M16×60", price: 200000, skuSuffix: "M16X60" },
      { label: "M20×80", price: 280000, skuSuffix: "M20X80" },
    ],
    tags: ["domestic", "bestseller"],
  },
  {
    title: "Hex Bolt Partial Thread Carbon Steel 8.8",
    description:
      "Hex bolt partial thread carbon steel 8.8, DIN 931 standard. Smooth shank resists shear better than full thread. For structural steel connections.",
    typeKey: "Hex Bolt",
    categoryKey: "bu-long-luc-giac",
    material: "Carbon Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "8.8",
    unit: "kg",
    sizes: [
      { label: "M10×50", price: 140000, skuSuffix: "M10X50" },
      { label: "M12×60", price: 160000, skuSuffix: "M12X60" },
      { label: "M16×80", price: 200000, skuSuffix: "M16X80" },
      { label: "M20×100", price: 300000, skuSuffix: "M20X100" },
    ],
    tags: ["imported"],
  },
  {
    title: "Hex Bolt Full Thread Stainless Steel 304 Korea",
    description:
      "Hex bolt stainless steel 304 from Korea — bright finish, precise threads. Preferred in electronics and high-end home appliances.",
    typeKey: "Hex Bolt",
    categoryKey: "bu-long-luc-giac",
    material: "Inox 304",
    originCountry: COUNTRY.KR,
    originLabel: "Korea",
    grade: "A2-70",
    unit: "kg",
    sizes: [
      { label: "M6×20", price: 180000, skuSuffix: "M6X20" },
      { label: "M8×30", price: 230000, skuSuffix: "M8X30" },
      { label: "M10×40", price: 280000, skuSuffix: "M10X40" },
      { label: "M12×50", price: 340000, skuSuffix: "M12X50" },
    ],
    tags: ["imported", "premium"],
  },

  // ═══ Carriage Bolts ═══
  {
    title: "Carriage Bolt Zinc-Plated Steel",
    description:
      "Carriage bolt square neck anti-rotation, carbon steel electro-zinc-plated. For wood, fences, scaffolding, iron gates.",
    typeKey: "Carriage Bolt",
    categoryKey: "bu-long-dau-tron",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "4.8",
    unit: "kg",
    sizes: [
      { label: "M8×40", price: 75000, skuSuffix: "M8X40" },
      { label: "M10×50", price: 90000, skuSuffix: "M10X50" },
      { label: "M12×60", price: 110000, skuSuffix: "M12X60" },
      { label: "M16×80", price: 150000, skuSuffix: "M16X80" },
    ],
    tags: ["imported", "budget"],
  },
  {
    title: "Carriage Bolt Stainless Steel 304",
    description:
      "Carriage bolt stainless steel 304 — for exteriors, marine construction, stainless railings, outdoor furniture. Rust-free, high aesthetic.",
    typeKey: "Carriage Bolt",
    categoryKey: "bu-long-dau-tron",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2-70",
    unit: "kg",
    sizes: [
      { label: "M8×40", price: 180000, skuSuffix: "M8X40" },
      { label: "M10×50", price: 220000, skuSuffix: "M10X50" },
      { label: "M12×60", price: 270000, skuSuffix: "M12X60" },
    ],
    tags: ["imported", "bestseller"],
  },

  // ═══ Countersunk Bolts ═══
  {
    title: "Socket Countersunk Bolt Carbon Steel 8.8",
    description:
      "Countersunk socket head bolt carbon steel 8.8, full thread. 90° countersunk head for flush mounting. For molds, jigs, machinery.",
    typeKey: "Countersunk Bolt",
    categoryKey: "bu-long-dau-chim",
    material: "Carbon Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "8.8",
    unit: "kg",
    sizes: [
      { label: "M6×20", price: 110000, skuSuffix: "M6X20" },
      { label: "M8×30", price: 140000, skuSuffix: "M8X30" },
      { label: "M10×40", price: 170000, skuSuffix: "M10X40" },
      { label: "M12×50", price: 210000, skuSuffix: "M12X50" },
    ],
    tags: ["imported", "bestseller"],
  },
  {
    title: "Socket Countersunk Bolt Stainless Steel 304",
    description:
      "Countersunk bolt stainless steel 304 — for food equipment, medical, high-end interiors. Aesthetic, rust-free, flush finish.",
    typeKey: "Countersunk Bolt",
    categoryKey: "bu-long-dau-chim",
    material: "Inox 304",
    originCountry: COUNTRY.JP,
    originLabel: "Japan",
    grade: "A2-70",
    unit: "kg",
    sizes: [
      { label: "M6×20", price: 220000, skuSuffix: "M6X20" },
      { label: "M8×30", price: 270000, skuSuffix: "M8X30" },
      { label: "M10×40", price: 330000, skuSuffix: "M10X40" },
    ],
    tags: ["imported", "premium"],
  },

  // ═══ Wood Screws ═══
  {
    title: "Flat Head Wood Screw Zinc-Plated Steel",
    description:
      "Flat head wood screw zinc-plated, deep thread for strong wood grip. For carpentry, indoor/outdoor woodwork, kitchen cabinets, beds and cabinets.",
    typeKey: "Wood Screw",
    categoryKey: "vit-go",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "Standard",
    unit: "box 200 pcs",
    sizes: [
      { label: "3×16mm", price: 35000, skuSuffix: "3X16" },
      { label: "4×25mm", price: 45000, skuSuffix: "4X25" },
      { label: "5×40mm", price: 55000, skuSuffix: "5X40" },
      { label: "6×60mm", price: 70000, skuSuffix: "6X60" },
    ],
    tags: ["imported", "budget", "bestseller"],
  },
  {
    title: "Pan Head Wood Screw Stainless Steel 304",
    description:
      "Pan head wood screw stainless steel 304 — for outdoor woodwork, decking, docks. Complete rust protection in humid environments.",
    typeKey: "Wood Screw",
    categoryKey: "vit-go",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2",
    unit: "box 100 pcs",
    sizes: [
      { label: "3×16mm", price: 65000, skuSuffix: "3X16" },
      { label: "4×25mm", price: 85000, skuSuffix: "4X25" },
      { label: "5×40mm", price: 110000, skuSuffix: "5X40" },
      { label: "6×60mm", price: 140000, skuSuffix: "6X60" },
    ],
    tags: ["imported", "bestseller"],
  },

  // ═══ Self-drilling Screws ═══
  {
    title: "Hex Head Self-drilling Screw Carbon Steel",
    description:
      "Self-drilling screw (tek screw) hex head, #2/#3 drill point, hardened carbon steel. Drills directly into sheet metal without pilot hole. For roofing sheets, factories.",
    typeKey: "Self-drilling Screw",
    categoryKey: "vit-tu-khoan",
    material: "Carbon Steel",
    originCountry: COUNTRY.KR,
    originLabel: "Korea",
    grade: "C1022",
    unit: "box 500 pcs",
    sizes: [
      { label: "M4.2×16mm", price: 120000, skuSuffix: "M42X16" },
      { label: "M4.8×20mm", price: 150000, skuSuffix: "M48X20" },
      { label: "M5.5×25mm", price: 180000, skuSuffix: "M55X25" },
      { label: "M6.3×32mm", price: 220000, skuSuffix: "M63X32" },
    ],
    tags: ["imported", "bestseller"],
  },
  {
    title: "Countersunk Self-drilling Screw with Wings",
    description:
      "Countersunk self-drilling screw with wood-cutting wings — drills through wood then into steel. For metal roofing, partitions, rolling doors. Zinc-plated rust-resistant.",
    typeKey: "Self-drilling Screw",
    categoryKey: "vit-tu-khoan",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "C1022",
    unit: "box 300 pcs",
    sizes: [
      { label: "M4.8×19mm", price: 130000, skuSuffix: "M48X19" },
      { label: "M5.5×25mm", price: 160000, skuSuffix: "M55X25" },
      { label: "M6.3×38mm", price: 200000, skuSuffix: "M63X38" },
    ],
    tags: ["imported"],
  },

  // ═══ Drywall Screws ═══
  {
    title: "Bugle Head Drywall Screw Phosphate Steel",
    description:
      "Drywall screw bugle head, black phosphate steel, fine thread. Dedicated for drywall, gypsum, partitions, ceilings.",
    typeKey: "Drywall Screw",
    categoryKey: "vit-ban-ton",
    material: "Phosphate Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "Standard",
    unit: "box 1000 pcs",
    sizes: [
      { label: "M3.5×25mm", price: 85000, skuSuffix: "M35X25" },
      { label: "M3.5×35mm", price: 95000, skuSuffix: "M35X35" },
      { label: "M4.2×40mm", price: 110000, skuSuffix: "M42X40" },
    ],
    tags: ["imported", "budget", "bestseller"],
  },
  {
    title: "Bugle Head Drywall Screw Stainless Steel 304",
    description:
      "Drywall screw stainless steel 304 — for humid areas, bathrooms, kitchens, cleanrooms. Rust-free, aesthetic.",
    typeKey: "Drywall Screw",
    categoryKey: "vit-ban-ton",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2",
    unit: "box 200 pcs",
    sizes: [
      { label: "M3.5×25mm", price: 75000, skuSuffix: "M35X25" },
      { label: "M3.5×35mm", price: 90000, skuSuffix: "M35X35" },
    ],
    tags: ["imported"],
  },

  // ═══ Standard Nuts ═══
  {
    title: "Hex Nut Carbon Steel 8.8",
    description:
      "Hex nut carbon steel grade 8.8, DIN 934 standard. Pairs with hex bolts of the same grade.",
    typeKey: "Standard Nut",
    categoryKey: "dai-oc-thuong",
    material: "Carbon Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "8.8",
    unit: "kg",
    sizes: [
      { label: "M6", price: 55000, skuSuffix: "M6" },
      { label: "M8", price: 65000, skuSuffix: "M8" },
      { label: "M10", price: 75000, skuSuffix: "M10" },
      { label: "M12", price: 85000, skuSuffix: "M12" },
      { label: "M16", price: 110000, skuSuffix: "M16" },
      { label: "M20", price: 150000, skuSuffix: "M20" },
    ],
    tags: ["imported", "bestseller"],
  },
  {
    title: "Hex Nut Stainless Steel 304",
    description:
      "Hex nut stainless steel 304 — pairs with stainless steel bolts. Rust-proof, for food, medical, outdoor use.",
    typeKey: "Standard Nut",
    categoryKey: "dai-oc-thuong",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2-70",
    unit: "kg",
    sizes: [
      { label: "M6", price: 110000, skuSuffix: "M6" },
      { label: "M8", price: 140000, skuSuffix: "M8" },
      { label: "M10", price: 170000, skuSuffix: "M10" },
      { label: "M12", price: 210000, skuSuffix: "M12" },
      { label: "M16", price: 280000, skuSuffix: "M16" },
    ],
    tags: ["imported", "bestseller"],
  },
  {
    title: "Hex Nut Zinc-Plated Steel",
    description:
      "Hex nut electro-zinc-plated steel, grade 4.8. Budget-friendly, for general applications not requiring high strength.",
    typeKey: "Standard Nut",
    categoryKey: "dai-oc-thuong",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "4.8",
    unit: "kg",
    sizes: [
      { label: "M6", price: 40000, skuSuffix: "M6" },
      { label: "M8", price: 48000, skuSuffix: "M8" },
      { label: "M10", price: 55000, skuSuffix: "M10" },
      { label: "M12", price: 65000, skuSuffix: "M12" },
      { label: "M16", price: 85000, skuSuffix: "M16" },
    ],
    tags: ["imported", "budget"],
  },
  {
    title: "Hex Nut Stainless Steel 316",
    description:
      "Hex nut stainless steel 316 — acid-resistant, salt-resistant. For chemical environments, marine, oil and gas.",
    typeKey: "Standard Nut",
    categoryKey: "dai-oc-thuong",
    material: "Inox 316",
    originCountry: COUNTRY.JP,
    originLabel: "Japan",
    grade: "A4-80",
    unit: "kg",
    sizes: [
      { label: "M8", price: 220000, skuSuffix: "M8" },
      { label: "M10", price: 270000, skuSuffix: "M10" },
      { label: "M12", price: 320000, skuSuffix: "M12" },
    ],
    tags: ["imported", "premium"],
  },

  // ═══ Lock Nuts ═══
  {
    title: "Nylon Insert Lock Nut Zinc-Plated Steel",
    description:
      "Nyloc lock nut with nylon insert prevents self-loosening, zinc-plated steel. No need for spring washers. For vibrating machinery, automotive, motorcycles.",
    typeKey: "Lock Nut",
    categoryKey: "dai-oc-khoa",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "8.8",
    unit: "kg",
    sizes: [
      { label: "M6", price: 80000, skuSuffix: "M6" },
      { label: "M8", price: 95000, skuSuffix: "M8" },
      { label: "M10", price: 110000, skuSuffix: "M10" },
      { label: "M12", price: 130000, skuSuffix: "M12" },
      { label: "M16", price: 170000, skuSuffix: "M16" },
    ],
    tags: ["imported", "bestseller"],
  },
  {
    title: "Nylon Insert Lock Nut Stainless Steel 304",
    description:
      "Lock nut stainless steel 304 with nylon insert — for outdoor equipment, marine, where rust protection + anti-loosening is required.",
    typeKey: "Lock Nut",
    categoryKey: "dai-oc-khoa",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2-70",
    unit: "kg",
    sizes: [
      { label: "M8", price: 180000, skuSuffix: "M8" },
      { label: "M10", price: 220000, skuSuffix: "M10" },
      { label: "M12", price: 260000, skuSuffix: "M12" },
    ],
    tags: ["imported", "premium"],
  },
  {
    title: "All-Metal Lock Nut Carbon Steel",
    description:
      "All-metal prevailing torque lock nut without nylon. High temperature resistant >250°C. For engines, turbines, boilers.",
    typeKey: "Lock Nut",
    categoryKey: "dai-oc-khoa",
    material: "Carbon Steel",
    originCountry: COUNTRY.KR,
    originLabel: "Korea",
    grade: "10.9",
    unit: "kg",
    sizes: [
      { label: "M8", price: 150000, skuSuffix: "M8" },
      { label: "M10", price: 180000, skuSuffix: "M10" },
      { label: "M12", price: 220000, skuSuffix: "M12" },
    ],
    tags: ["imported", "premium"],
  },

  // ═══ Wing Nuts ═══
  {
    title: "Wing Nut Zinc-Plated Steel",
    description:
      "Wing nut zinc-plated steel, tightened by hand without tools. For swivel chairs, jigs, quick-assembly furniture.",
    typeKey: "Wing Nut",
    categoryKey: "dai-oc-canh",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "Standard",
    unit: "pcs",
    sizes: [
      { label: "M6", price: 1500, skuSuffix: "M6" },
      { label: "M8", price: 2000, skuSuffix: "M8" },
      { label: "M10", price: 3000, skuSuffix: "M10" },
      { label: "M12", price: 4000, skuSuffix: "M12" },
    ],
    tags: ["imported", "budget"],
  },
  {
    title: "Wing Nut Stainless Steel 304",
    description:
      "Wing nut stainless steel 304 — for medical devices, food equipment, stainless steel jigs. Convenient hand-tightening, rust-proof.",
    typeKey: "Wing Nut",
    categoryKey: "dai-oc-canh",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2",
    unit: "pcs",
    sizes: [
      { label: "M6", price: 4000, skuSuffix: "M6" },
      { label: "M8", price: 5500, skuSuffix: "M8" },
      { label: "M10", price: 7500, skuSuffix: "M10" },
    ],
    tags: ["imported"],
  },

  // ═══ Plastic Anchors ═══
  {
    title: "Universal PA6 Plastic Wall Plug",
    description:
      "PA6 plastic wall plug, high quality, for brick walls, lightweight concrete. Comes with zinc-plated steel screw. Load capacity 10-50kg.",
    typeKey: "Plastic Anchor",
    categoryKey: "tac-ke-nhua",
    material: "PA6 Plastic",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "Standard",
    unit: "box 100 sets",
    sizes: [
      { label: "6×30mm", price: 25000, skuSuffix: "6X30" },
      { label: "8×40mm", price: 35000, skuSuffix: "8X40" },
      { label: "10×50mm", price: 50000, skuSuffix: "10X50" },
      { label: "12×60mm", price: 70000, skuSuffix: "12X60" },
    ],
    tags: ["imported", "budget", "bestseller"],
  },
  {
    title: "Premium Nylon Heavy-Duty Wall Plug",
    description:
      "Premium nylon wall plug, 4-way expansion wings, load capacity up to 100kg. For water heaters, air conditioners, heavy shelving, wall-mounted TVs.",
    typeKey: "Plastic Anchor",
    categoryKey: "tac-ke-nhua",
    material: "Premium Nylon",
    originCountry: COUNTRY.DE,
    originLabel: "Germany",
    grade: "Premium",
    unit: "box 50 sets",
    sizes: [
      { label: "8×50mm", price: 55000, skuSuffix: "8X50" },
      { label: "10×65mm", price: 75000, skuSuffix: "10X65" },
      { label: "12×80mm", price: 100000, skuSuffix: "12X80" },
    ],
    tags: ["imported", "premium"],
  },

  // ═══ Metal Anchors ═══
  {
    title: "4-Way Drop-In Anchor Zinc-Plated Steel",
    description:
      "Drop-in anchor 4-way expansion, carbon steel zinc-plated. Drill hole, insert, tighten bolt to expand. Very high load for concrete.",
    typeKey: "Metal Anchor",
    categoryKey: "tac-ke-sat",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "8.8",
    unit: "pcs",
    sizes: [
      { label: "M6×35mm", price: 3000, skuSuffix: "M6X35" },
      { label: "M8×45mm", price: 4500, skuSuffix: "M8X45" },
      { label: "M10×55mm", price: 6500, skuSuffix: "M10X55" },
      { label: "M12×70mm", price: 10000, skuSuffix: "M12X70" },
      { label: "M16×90mm", price: 18000, skuSuffix: "M16X90" },
    ],
    tags: ["imported", "bestseller"],
  },
  {
    title: "Drop-In Anchor Stainless Steel 304",
    description:
      "Drop-in anchor stainless steel 304 — for marine construction, docks, outdoors. Corrosion-resistant, permanent durability.",
    typeKey: "Metal Anchor",
    categoryKey: "tac-ke-sat",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2-70",
    unit: "pcs",
    sizes: [
      { label: "M8×45mm", price: 12000, skuSuffix: "M8X45" },
      { label: "M10×55mm", price: 18000, skuSuffix: "M10X55" },
      { label: "M12×70mm", price: 25000, skuSuffix: "M12X70" },
    ],
    tags: ["imported", "premium"],
  },

  // ═══ Expansion Bolts ═══
  {
    title: "Wedge Anchor Zinc-Plated Steel",
    description:
      "Wedge anchor (expansion bolt) carbon steel zinc-plated. Drill hole, tighten nut to expand. Extremely high pull-out load for solid concrete.",
    typeKey: "Expansion Bolt",
    categoryKey: "tac-ke-no",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "5.8",
    unit: "pcs",
    sizes: [
      { label: "M8×60mm", price: 5000, skuSuffix: "M8X60" },
      { label: "M10×75mm", price: 8000, skuSuffix: "M10X75" },
      { label: "M12×100mm", price: 13000, skuSuffix: "M12X100" },
      { label: "M16×125mm", price: 22000, skuSuffix: "M16X125" },
    ],
    tags: ["imported", "bestseller"],
  },

  // ═══ Threaded Rods ═══
  {
    title: "Threaded Rod Zinc-Plated Steel",
    description:
      "Threaded rod (stud rod) carbon steel zinc-plated, full thread 1 meter long. For pipe hangers, brackets, structural bracing.",
    typeKey: "Threaded Rod",
    categoryKey: "ty-ren",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "4.8",
    unit: "1m rod",
    sizes: [
      { label: "M6×1m", price: 12000, skuSuffix: "M6X1M" },
      { label: "M8×1m", price: 18000, skuSuffix: "M8X1M" },
      { label: "M10×1m", price: 25000, skuSuffix: "M10X1M" },
      { label: "M12×1m", price: 35000, skuSuffix: "M12X1M" },
      { label: "M16×1m", price: 55000, skuSuffix: "M16X1M" },
      { label: "M20×1m", price: 85000, skuSuffix: "M20X1M" },
    ],
    tags: ["imported", "bestseller", "budget"],
  },
  {
    title: "Threaded Rod Stainless Steel 304",
    description:
      "Threaded rod stainless steel 304, 1 meter length — for humid environments, mild chemicals, stainless steel interior decoration, railings.",
    typeKey: "Threaded Rod",
    categoryKey: "ty-ren",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2-70",
    unit: "1m rod",
    sizes: [
      { label: "M6×1m", price: 30000, skuSuffix: "M6X1M" },
      { label: "M8×1m", price: 45000, skuSuffix: "M8X1M" },
      { label: "M10×1m", price: 65000, skuSuffix: "M10X1M" },
      { label: "M12×1m", price: 90000, skuSuffix: "M12X1M" },
      { label: "M16×1m", price: 140000, skuSuffix: "M16X1M" },
    ],
    tags: ["imported", "bestseller"],
  },
  {
    title: "Threaded Rod Carbon Steel Grade 8.8",
    description:
      "Threaded rod carbon steel grade 8.8, for heavy-load hangers, structural steel bracing, machine bases. Higher strength than standard 4.8 rods.",
    typeKey: "Threaded Rod",
    categoryKey: "ty-ren",
    material: "Carbon Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "8.8",
    unit: "1m rod",
    sizes: [
      { label: "M10×1m", price: 35000, skuSuffix: "M10X1M" },
      { label: "M12×1m", price: 50000, skuSuffix: "M12X1M" },
      { label: "M16×1m", price: 75000, skuSuffix: "M16X1M" },
      { label: "M20×1m", price: 120000, skuSuffix: "M20X1M" },
    ],
    tags: ["imported"],
  },
  {
    title: "Threaded Rod Stainless Steel 316",
    description:
      "Threaded rod stainless steel 316 — acid-resistant, salt-resistant, chemical-resistant. For chemical plants, drilling rigs, marine construction.",
    typeKey: "Threaded Rod",
    categoryKey: "ty-ren",
    material: "Inox 316",
    originCountry: COUNTRY.JP,
    originLabel: "Japan",
    grade: "A4-80",
    unit: "1m rod",
    sizes: [
      { label: "M8×1m", price: 75000, skuSuffix: "M8X1M" },
      { label: "M10×1m", price: 100000, skuSuffix: "M10X1M" },
      { label: "M12×1m", price: 140000, skuSuffix: "M12X1M" },
    ],
    tags: ["imported", "premium"],
  },

  // ═══ Flat Washers ═══
  {
    title: "Flat Washer Zinc-Plated Steel",
    description:
      "Flat washer zinc-plated steel, DIN 125A standard. Distributes clamping force, protects surfaces, prevents sinking.",
    typeKey: "Flat Washer",
    categoryKey: "vong-dem-phang",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "Standard",
    unit: "kg",
    sizes: [
      { label: "M6", price: 30000, skuSuffix: "M6" },
      { label: "M8", price: 35000, skuSuffix: "M8" },
      { label: "M10", price: 40000, skuSuffix: "M10" },
      { label: "M12", price: 48000, skuSuffix: "M12" },
      { label: "M16", price: 65000, skuSuffix: "M16" },
      { label: "M20", price: 85000, skuSuffix: "M20" },
    ],
    tags: ["imported", "budget", "bestseller"],
  },
  {
    title: "Flat Washer Stainless Steel 304",
    description:
      "Flat washer stainless steel 304 — pairs with stainless steel bolts. Rust-proof, aesthetic, for outdoor, food use.",
    typeKey: "Flat Washer",
    categoryKey: "vong-dem-phang",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2",
    unit: "kg",
    sizes: [
      { label: "M6", price: 65000, skuSuffix: "M6" },
      { label: "M8", price: 80000, skuSuffix: "M8" },
      { label: "M10", price: 100000, skuSuffix: "M10" },
      { label: "M12", price: 120000, skuSuffix: "M12" },
      { label: "M16", price: 160000, skuSuffix: "M16" },
    ],
    tags: ["imported", "bestseller"],
  },
  {
    title: "Fender Washer Large OD Zinc-Plated Steel",
    description:
      "Fender washer with outer diameter 3x standard. For wood, thin sheet metal, plastic — where wide force distribution is needed to prevent sinking or tear-through.",
    typeKey: "Flat Washer",
    categoryKey: "vong-dem-phang",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "Standard",
    unit: "kg",
    sizes: [
      { label: "M8", price: 50000, skuSuffix: "M8" },
      { label: "M10", price: 60000, skuSuffix: "M10" },
      { label: "M12", price: 75000, skuSuffix: "M12" },
    ],
    tags: ["imported"],
  },

  // ═══ Spring Washers ═══
  {
    title: "Spring Lock Washer Carbon Steel",
    description:
      "Spring washer (lock washer) hardened carbon steel, DIN 127B standard. Prevents self-loosening from vibration.",
    typeKey: "Spring Washer",
    categoryKey: "vong-dem-venh",
    material: "Carbon Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "Standard",
    unit: "kg",
    sizes: [
      { label: "M6", price: 35000, skuSuffix: "M6" },
      { label: "M8", price: 42000, skuSuffix: "M8" },
      { label: "M10", price: 50000, skuSuffix: "M10" },
      { label: "M12", price: 60000, skuSuffix: "M12" },
      { label: "M16", price: 80000, skuSuffix: "M16" },
      { label: "M20", price: 110000, skuSuffix: "M20" },
    ],
    tags: ["imported", "budget", "bestseller"],
  },
  {
    title: "Spring Lock Washer Stainless Steel 304",
    description:
      "Spring washer stainless steel 304 — anti-loosening + rust-proof. For outdoor equipment, marine, food industry.",
    typeKey: "Spring Washer",
    categoryKey: "vong-dem-venh",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2",
    unit: "kg",
    sizes: [
      { label: "M8", price: 85000, skuSuffix: "M8" },
      { label: "M10", price: 105000, skuSuffix: "M10" },
      { label: "M12", price: 130000, skuSuffix: "M12" },
    ],
    tags: ["imported"],
  },

  // ═══ Angle Brackets ═══
  {
    title: "90° Angle Bracket Pre-drilled Zinc-Plated Steel",
    description:
      "Angle bracket 90° zinc-plated steel, pre-drilled holes. For corner joints in wood, shelving, tables, frames. Good load bearing.",
    typeKey: "Angle Bracket",
    categoryKey: "ke-goc",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.VN,
    originLabel: "Vietnam",
    grade: "Standard",
    unit: "pcs",
    sizes: [
      { label: "40×40mm", price: 3000, skuSuffix: "40X40" },
      { label: "60×60mm", price: 5000, skuSuffix: "60X60" },
      { label: "80×80mm", price: 8000, skuSuffix: "80X80" },
      { label: "100×100mm", price: 12000, skuSuffix: "100X100" },
    ],
    tags: ["domestic", "budget", "bestseller"],
  },
  {
    title: "Angle Bracket Stainless Steel 304",
    description:
      "Angle bracket stainless steel 304 — for stainless shelving, stainless tables, kitchens, bathrooms. Rust-free, aesthetic, high durability.",
    typeKey: "Angle Bracket",
    categoryKey: "ke-goc",
    material: "Inox 304",
    originCountry: COUNTRY.VN,
    originLabel: "Vietnam",
    grade: "A2",
    unit: "pcs",
    sizes: [
      { label: "40×40mm", price: 8000, skuSuffix: "40X40" },
      { label: "60×60mm", price: 13000, skuSuffix: "60X60" },
      { label: "80×80mm", price: 20000, skuSuffix: "80X80" },
    ],
    tags: ["domestic", "bestseller"],
  },

  // ═══ Split Pins (Cotter Pins) ═══
  {
    title: "Cotter Pin Zinc-Plated Steel",
    description:
      "Cotter pin (split pin) zinc-plated steel, DIN 94 standard. Safety pin prevents nut slipping on shafts, spindles. For automotive, machinery.",
    typeKey: "Split Pin",
    categoryKey: "chot-che",
    material: "Zinc-Plated Steel",
    originCountry: COUNTRY.CN,
    originLabel: "China",
    grade: "Standard",
    unit: "box 100 pcs",
    sizes: [
      { label: "2×20mm", price: 12000, skuSuffix: "2X20" },
      { label: "3×30mm", price: 15000, skuSuffix: "3X30" },
      { label: "4×40mm", price: 20000, skuSuffix: "4X40" },
      { label: "5×50mm", price: 28000, skuSuffix: "5X50" },
      { label: "6×60mm", price: 35000, skuSuffix: "6X60" },
    ],
    tags: ["imported", "budget"],
  },
  {
    title: "Cotter Pin Stainless Steel 304",
    description:
      "Cotter pin stainless steel 304 — for humid environments, chemicals, medical devices, marine. Rust-proof, high durability.",
    typeKey: "Split Pin",
    categoryKey: "chot-che",
    material: "Inox 304",
    originCountry: COUNTRY.TW,
    originLabel: "Taiwan",
    grade: "A2",
    unit: "box 50 pcs",
    sizes: [
      { label: "3×30mm", price: 25000, skuSuffix: "3X30" },
      { label: "4×40mm", price: 35000, skuSuffix: "4X40" },
      { label: "5×50mm", price: 48000, skuSuffix: "5X50" },
    ],
    tags: ["imported"],
  },
]

// ── Customer definitions ─────────────────────────────────────────────

interface CustomerDef {
  companyName: string
  firstName: string
  lastName: string
  email: string
  phone: string
  address1: string
  city: string
  province: string
  group: "xd" | "vlxd" | "ck" | "nt" | "ntt" // construction, building materials, machinery, contractor, interior design
}

const CUSTOMERS: CustomerDef[] = [
  // ═══ Construction Companies ═══
  {
    companyName: "Công ty CP Xây Dựng Minh Phát",
    firstName: "Tuấn", lastName: "Nguyễn", email: "tuan.nguyen@minhphat-cons.vn",
    phone: "0903123456", address1: "123 Nguyễn Văn Linh", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "xd",
  },
  {
    companyName: "Công ty TNHH Xây Lắp Thành Công",
    firstName: "Hùng", lastName: "Trần", email: "hung.tran@thanhcong-xl.vn",
    phone: "0903223344", address1: "456 Lê Duẩn", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "xd",
  },
  {
    companyName: "Công ty CP Đầu Tư Xây Dựng An Bình",
    firstName: "Phương", lastName: "Lê", email: "phuong.le@anbinh-cons.vn",
    phone: "0913556677", address1: "78 Trường Chinh", city: "Biên Hoà", province: "Đồng Nai", group: "xd",
  },
  {
    companyName: "Công ty TNHH XD TM Hoàng Long",
    firstName: "Long", lastName: "Phạm", email: "long.pham@hoanglong.vn",
    phone: "0908445566", address1: "245 Phạm Văn Đồng", city: "Thủ Đức", province: "TP. Hồ Chí Minh", group: "xd",
  },
  {
    companyName: "Công ty CP Xây Dựng Đại Phúc",
    firstName: "Phúc", lastName: "Võ", email: "phuc.vo@daiphuc.vn",
    phone: "0933558899", address1: "56 Cách Mạng Tháng 8", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "xd",
  },
  {
    companyName: "Công ty TNHH Xây Dựng Nam Việt",
    firstName: "Hải", lastName: "Đỗ", email: "hai.do@namviet-cons.vn",
    phone: "0909332211", address1: "89 Nguyễn Thị Minh Khai", city: "Vũng Tàu", province: "Bà Rịa - Vũng Tàu", group: "xd",
  },
  {
    companyName: "Công ty CP Hạ Tầng & Xây Dựng Sài Gòn",
    firstName: "Dũng", lastName: "Ngô", email: "dung.ngo@sghatam.vn",
    phone: "0912778899", address1: "340 Điện Biên Phủ", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "xd",
  },
  {
    companyName: "Công ty TNHH Xây Dựng Dân Dụng Phú Mỹ",
    firstName: "Mỹ", lastName: "Huỳnh", email: "my.huynh@phumycons.vn",
    phone: "0905667788", address1: "12 Lý Thường Kiệt", city: "Bình Dương", province: "Bình Dương", group: "xd",
  },
  {
    companyName: "Công ty CP Thi Công Cơ Điện Lạnh ATP",
    firstName: "An", lastName: "Mai", email: "an.mai@atp-mep.vn",
    phone: "0983123456", address1: "78 Hoàng Văn Thụ", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "xd",
  },
  {
    companyName: "Công ty TNHH Kiến Trúc & Xây Dựng GreenHome",
    firstName: "Linh", lastName: "Đặng", email: "linh.dang@greenhome.vn",
    phone: "0918222333", address1: "567 Nguyễn Huệ", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "xd",
  },

  // ═══ Building Material & Hardware Stores ═══
  {
    companyName: "CH VLXD Minh Phát",
    firstName: "Tâm", lastName: "Nguyễn", email: "tam.nguyen@minhphat-vlxd.vn",
    phone: "0907111222", address1: "234 Quốc lộ 13", city: "Thủ Đức", province: "TP. Hồ Chí Minh", group: "vlxd",
  },
  {
    companyName: "Cửa Hàng Phần Cứng Thanh Tùng",
    firstName: "Tùng", lastName: "Lê", email: "tung.le@thanhtung-hardware.vn",
    phone: "0988999111", address1: "78 Tôn Đức Thắng", city: "Biên Hoà", province: "Đồng Nai", group: "vlxd",
  },
  {
    companyName: "CH Vật Tư Ngành Nước Đức Thịnh",
    firstName: "Thịnh", lastName: "Phan", email: "thinh.phan@ducthinh.vn",
    phone: "0902333444", address1: "456 Hùng Vương", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "vlxd",
  },
  {
    companyName: "Cửa Hàng Kim Khí Bảy Nghĩa",
    firstName: "Nghĩa", lastName: "Bùi", email: "nghia.bui@baynghia-kk.vn",
    phone: "0937888555", address1: "12 An Dương Vương", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "vlxd",
  },
  {
    companyName: "CH VLXD Gia Bảo",
    firstName: "Bảo", lastName: "Trương", email: "bao.truong@giabao-vlxd.vn",
    phone: "0911222333", address1: "890 Kinh Dương Vương", city: "Bình Tân", province: "TP. Hồ Chí Minh", group: "vlxd",
  },
  {
    companyName: "Cửa Hàng Phần Cứng Đại Thắng",
    firstName: "Thắng", lastName: "Hoàng", email: "thang.hoang@daithang-hw.vn",
    phone: "0905556667", address1: "34 Nguyễn Trãi", city: "Dĩ An", province: "Bình Dương", group: "vlxd",
  },
  {
    companyName: "CH Kim Khí Điện Máy Hưng Thịnh",
    firstName: "Hưng", lastName: "Vũ", email: "hung.vu@hungthinh-kk.vn",
    phone: "0987444555", address1: "567 Lê Hồng Phong", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "vlxd",
  },
  {
    companyName: "CH VLXD & Trang Trí Nội Thất Tín Phát",
    firstName: "Tín", lastName: "Lâm", email: "tin.lam@tinphat.vn",
    phone: "0919333444", address1: "90 Võ Văn Ngân", city: "Thủ Đức", province: "TP. Hồ Chí Minh", group: "vlxd",
  },
  {
    companyName: "Cửa Hàng Vật Tư Xây Dựng Hoa Sen",
    firstName: "Sen", lastName: "Đoàn", email: "sen.doan@hoasen-vt.vn",
    phone: "0908777666", address1: "23 Phan Đăng Lưu", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "vlxd",
  },
  {
    companyName: "CH Bu Lông Ốc Vít Bình Dương",
    firstName: "Dương", lastName: "Lý", email: "duong.ly@blov-bd.vn",
    phone: "0906111222", address1: "78 Đại lộ Bình Dương", city: "Thuận An", province: "Bình Dương", group: "vlxd",
  },

  // ═══ Machine Shops ═══
  {
    companyName: "Xưởng Cơ Khí Chính Xác CNC Quốc Dũng",
    firstName: "Dũng", lastName: "Hồ", email: "dung.ho@quocdung-cnc.vn",
    phone: "0985111222", address1: "45 Tân Kỳ Tân Quý", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "ck",
  },
  {
    companyName: "Cơ Khí Chế Tạo Máy Thành Đạt",
    firstName: "Đạt", lastName: "Cao", email: "dat.cao@thanhdat-ck.vn",
    phone: "0907444555", address1: "123 Quốc lộ 1A", city: "Thủ Đức", province: "TP. Hồ Chí Minh", group: "ck",
  },
  {
    companyName: "Xưởng Gia Công Cơ Khí Phương Nam",
    firstName: "Nam", lastName: "Phương", email: "nam.phuong@phuongnam-mw.vn",
    phone: "0913555888", address1: "56 Nguyễn Xiển", city: "Dĩ An", province: "Bình Dương", group: "ck",
  },
  {
    companyName: "Cơ Khí Khuôn Mẫu Chính Xác MK-Tech",
    firstName: "Khang", lastName: "Mạc", email: "khang.mac@mktechnology.vn",
    phone: "0932888999", address1: "78 Song Hành", city: "Thuận An", province: "Bình Dương", group: "ck",
  },
  {
    companyName: "Xưởng Tiện Phay CNC Anh Khoa",
    firstName: "Khoa", lastName: "Nguyễn", email: "khoa.nguyen@anhkhoa-cnc.vn",
    phone: "0909999888", address1: "234 Lê Văn Việt", city: "Thủ Đức", province: "TP. Hồ Chí Minh", group: "ck",
  },
  {
    companyName: "Cơ Khí & Kết Cấu Thép Hải Âu",
    firstName: "Âu", lastName: "Phạm Hải", email: "au.pham@haiau-steel.vn",
    phone: "0917666555", address1: "12 Võ Chí Công", city: "Biên Hoà", province: "Đồng Nai", group: "ck",
  },
  {
    companyName: "DN Cơ Khí Sửa Chữa Máy Công Nghiệp Tấn Lộc",
    firstName: "Lộc", lastName: "Hà Tấn", email: "loc.ha@tanloc-ir.vn",
    phone: "0986222333", address1: "45 Nguyễn Văn Bảo", city: "Gò Vấp", province: "TP. Hồ Chí Minh", group: "ck",
  },
  {
    companyName: "Cơ Sở Cơ Khí Gò Hàn Inox Thanh Tuyền",
    firstName: "Tuyền", lastName: "Trần Thanh", email: "tuyen.tran@thanhtuyen-inox.vn",
    phone: "0903888777", address1: "67 Tô Ngọc Vân", city: "Thủ Đức", province: "TP. Hồ Chí Minh", group: "ck",
  },

  // ═══ Contractors ═══
  {
    companyName: "Nhà Thầu Xây Dựng Nguyễn Văn Bình",
    firstName: "Bình", lastName: "Nguyễn Văn", email: "binh.nv@thaukhoan.vn",
    phone: "0903444555", address1: "90 Nguyễn Oanh", city: "Gò Vấp", province: "TP. Hồ Chí Minh", group: "nt",
  },
  {
    companyName: "Thầu Khoán Công Trình Trần Quốc Toản",
    firstName: "Toản", lastName: "Trần Quốc", email: "toan.tq@thaukhoan.vn",
    phone: "0918999111", address1: "34 Phan Văn Trị", city: "Bình Thạnh", province: "TP. Hồ Chí Minh", group: "nt",
  },
  {
    companyName: "Nhà Thầu Cơ Điện Lạnh Lê Gia",
    firstName: "Gia", lastName: "Lê", email: "gia.le@legia-mep.vn",
    phone: "0989333222", address1: "56 Xô Viết Nghệ Tĩnh", city: "Bình Thạnh", province: "TP. Hồ Chí Minh", group: "nt",
  },
  {
    companyName: "Thầu Xây Dựng Dân Dụng Phạm Văn Hòa",
    firstName: "Hòa", lastName: "Phạm Văn", email: "hoa.pv@thauxaydung.vn",
    phone: "0907555444", address1: "78 Hoàng Sa", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "nt",
  },
  {
    companyName: "Nhà Thầu Sơn Bả Hoàn Thiện Đức Anh",
    firstName: "Anh", lastName: "Phan Đức", email: "anh.pd@ducanh-finishing.vn",
    phone: "0913222111", address1: "12 Nguyễn Cửu Vân", city: "Bình Thạnh", province: "TP. Hồ Chí Minh", group: "nt",
  },
  {
    companyName: "Thầu Phần Thô & Kết Cấu Mai Văn Sơn",
    firstName: "Sơn", lastName: "Mai Văn", email: "son.mv@sonketcau.vn",
    phone: "0933777888", address1: "45 Bùi Đình Tuý", city: "Bình Thạnh", province: "TP. Hồ Chí Minh", group: "nt",
  },
  {
    companyName: "Tổ Thợ Xây Dựng & Sửa Chữa Nhà Ở Thanh Hải",
    firstName: "Hải", lastName: "Vũ Thanh", email: "hai.vt@thanhhai-build.vn",
    phone: "0909111222", address1: "89 Nguyễn Kiệm", city: "Phú Nhuận", province: "TP. Hồ Chí Minh", group: "nt",
  },

  // ═══ Interior Design Companies ═══
  {
    companyName: "Công ty CP Nội Thất Gia Phát",
    firstName: "Phát", lastName: "Trịnh", email: "phat.trinh@giaphat-furniture.vn",
    phone: "0908222111", address1: "345 Nguyễn Thị Thập", city: "Quận 7", province: "TP. Hồ Chí Minh", group: "ntt",
  },
  {
    companyName: "Công ty TNHH Nội Thất Gỗ An Cường",
    firstName: "Cường", lastName: "Lê An", email: "cuong.la@ancuong-wood.vn",
    phone: "0915444333", address1: "12 Tân Thới Hiệp", city: "Quận 12", province: "TP. Hồ Chí Minh", group: "ntt",
  },
  {
    companyName: "Công ty CP Thiết Kế & Thi Công Nội Thất Mộc Việt",
    firstName: "Việt", lastName: "Nguyễn", email: "viet.nguyen@mocviet-interior.vn",
    phone: "0983666444", address1: "78 Phan Huy Ích", city: "Gò Vấp", province: "TP. Hồ Chí Minh", group: "ntt",
  },
  {
    companyName: "Công ty TNHH Nội Thất Inox Việt Nhật",
    firstName: "Nhật", lastName: "Lý", email: "nhat.ly@vietnhat-inox.vn",
    phone: "0909555666", address1: "56 Quốc lộ 13", city: "Thuận An", province: "Bình Dương", group: "ntt",
  },
  {
    companyName: "Công ty CP Nội Thất Cao Cấp ArtHome",
    firstName: "Huy", lastName: "Trần Quang", email: "huy.tq@arthome-interior.vn",
    phone: "0912777333", address1: "90 Mai Chí Thọ", city: "TP. Hồ Chí Minh", province: "TP. Hồ Chí Minh", group: "ntt",
  },
]

// ── Main seed function ───────────────────────────────────────────────

export default async function seedHardwareStore({ container, args }: any) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // Robust --reset / -r detection: check args param AND process.argv
  const rawArgs: string[] = Array.isArray(args) ? args
    : typeof args === "string" ? [args]
    : args && typeof args === "object" ? Object.values(args).filter((v): v is string => typeof v === "string")
    : []
  const hasResetInArgs = rawArgs.some((a: string) => String(a).includes("--reset") || a === "-r")
  const hasResetInArgv = process.argv.some((a: string) => String(a).includes("--reset") || a === "-r")
  const shouldReset = hasResetInArgs || hasResetInArgv

  process.stderr.write("[seed] KAMI Hardware Store Seeder\n")
  process.stderr.write(`[seed] Reset mode: ${shouldReset ? "YES" : "no (idempotent)"}\n\n`)

  // ── Step 0: Check if already seeded ────────────────────────────────
  const existingProducts = await query.graph({
    entity: "product",
    fields: ["id", "title"],
    filters: { title: "Hex Bolt Full Thread Carbon Steel 8.8" },
  })

  if (existingProducts.data?.length > 0 && !shouldReset) {
    console.log(JSON.stringify({ ok: true, action: "skip", reason: "already seeded (use --reset to re-seed or -r)", existing_products: existingProducts.data.length }))
    return
  }

  // ── Step 1: Region (always reuse existing infrastructure) ──────────
  process.stderr.write("[seed] Step 1/8: Finding or creating region...\n")
  let regionId = ""
  const existingRegions = await query.graph({ entity: "region", fields: ["id", "name"], filters: { currency_code: "vnd" } })
  if (existingRegions.data?.length > 0) {
    regionId = (existingRegions.data[0] as any).id
    process.stderr.write(`[seed]   Region reused: ${regionId}\n`)
  } else {
    const { createRegionsWorkflow } = await import("@medusajs/core-flows")
    const result = await createRegionsWorkflow(container).run({
      input: { regions: [{ name: "Vietnam", currency_code: "vnd", countries: ["vn"], automatic_taxes: false, is_tax_inclusive: false }] },
    })
    regionId = (result.result as any)?.id ?? (result.result as any)?.[0]?.id ?? ""
    if (!regionId) {
      const r = await query.graph({ entity: "region", fields: ["id"], filters: { currency_code: "vnd" } })
      regionId = (r.data?.[0] as any)?.id ?? ""
    }
    process.stderr.write(`[seed]   Region created: ${regionId}\n`)
  }

  // ── Step 2: Sales Channel (always reuse existing) ───────────────────
  process.stderr.write("[seed] Step 2/8: Finding or creating sales channel...\n")
  let salesChannelId = ""
  const existingChannels = await query.graph({ entity: "sales_channel", fields: ["id", "name"], filters: { name: "Wholesale" } })
  if (existingChannels.data?.length > 0) {
    salesChannelId = (existingChannels.data[0] as any).id
    process.stderr.write(`[seed]   Sales channel reused: ${salesChannelId}\n`)
  } else {
    const { createSalesChannelsWorkflow } = await import("@medusajs/core-flows")
    const result = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Wholesale", description: "B2B hardware supply wholesale channel" }] },
    })
    salesChannelId = (result.result as any)?.id ?? (result.result as any)?.[0]?.id ?? ""
    if (!salesChannelId) {
      const r = await query.graph({ entity: "sales_channel", fields: ["id"], filters: { name: "Wholesale" } })
      salesChannelId = (r.data?.[0] as any)?.id ?? ""
    }
    process.stderr.write(`[seed]   Sales channel created: ${salesChannelId}\n`)
  }

  // ── Step 3: Stock Locations (always reuse existing) ─────────────────
  process.stderr.write("[seed] Step 3/8: Finding or creating stock locations...\n")
  let mainLocationId = ""

  // Find existing stock location or create new one
  const existingLocations = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
    filters: { name: "Main Warehouse — Ho Chi Minh City" }
  })

  if (existingLocations.data?.length > 0) {
    mainLocationId = (existingLocations.data[0] as any).id
    process.stderr.write(`[seed]   Stock location reused: ${mainLocationId}\n`)
  } else {
    const { createStockLocationsWorkflow } = await import("@medusajs/core-flows")
    try {
      const locInput = {
        locations: [
          {
            name: "Main Warehouse — Ho Chi Minh City",
            address: {
              address_1: "123 Quốc lộ 1A, P. Bình Hưng Hòa",
              city: "TP. Hồ Chí Minh",
              country_code: "vn",
              province: "TP. Hồ Chí Minh",
              postal_code: "700000",
            },
          },
        ],
      }
      const result = await createStockLocationsWorkflow(container).run({ input: locInput })
      mainLocationId = (result.result as any)?.id ?? (result.result as any)?.[0]?.id ?? ""
      process.stderr.write(`[seed]   Stock location created: ${mainLocationId}\n`)
    } catch (e: any) {
      process.stderr.write(`[seed]   Stock location warning: ${e.message?.slice(0,120)}...\n`)
    }

    if (!mainLocationId) {
      const r = await query.graph({ entity: "stock_location", fields: ["id"], filters: { name: "Main Warehouse — Ho Chi Minh City" } })
      mainLocationId = (r.data?.[0] as any)?.id ?? ""
    }
  }
  process.stderr.write(`[seed]   Main Warehouse: ${mainLocationId}\n`)

  // ── Step 3b: Link Sales Channel → Stock Location ────────────────────
  // CRITICAL: Without this link, createOrdersWorkflow will fail with
  // "Sales channel X is not associated with any stock location for variant Y"
  // because confirmVariantInventoryWorkflow checks:
  //   variant → inventory_item → inventory_level → stock_location → sales_channel
  process.stderr.write("[seed] Step 3b/8: Linking sales channel ↔ stock location...\n")
  if (salesChannelId && mainLocationId) {
    try {
      const { linkSalesChannelsToStockLocationWorkflow } = await import("@medusajs/core-flows")
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: {
          id: mainLocationId,
          add: [salesChannelId],
        },
      })
      process.stderr.write(`[seed]   Linked SC ${salesChannelId} ↔ SL ${mainLocationId}\n`)
    } catch (e: any) {
      // Link may already exist — that's fine
      if (e.message?.includes("already exists") || e.message?.includes("duplicate") || e.message?.includes("unique")) {
        process.stderr.write(`[seed]   SC ↔ SL link already exists (OK)\n`)
      } else {
        // Fallback: try direct link via remoteLink
        try {
          const link = container.resolve(ContainerRegistrationKeys.LINK)
          await link.create({
            [require("@medusajs/framework/utils").Modules.SALES_CHANNEL]: {
              sales_channel_id: salesChannelId,
            },
            [require("@medusajs/framework/utils").Modules.STOCK_LOCATION]: {
              stock_location_id: mainLocationId,
            },
          })
          process.stderr.write(`[seed]   Linked SC ↔ SL via remoteLink (fallback)\n`)
        } catch (e2: any) {
          process.stderr.write(`[seed]   SC ↔ SL link warning: ${e2.message?.slice(0,120)}...\n`)
        }
      }
    }
  } else {
    process.stderr.write(`[seed]   WARNING: Cannot link — SC=${salesChannelId}, SL=${mainLocationId}\n`)
  }

  // ── Step 4: Delete test data (if --reset) ───────────────────────────
  if (shouldReset) {
    process.stderr.write("[seed] Step 4a: Deleting existing test data...\n")
    try {
      // Delete orders first (FK constraints)
      const existingOrders = await query.graph({ entity: "order", fields: ["id"], limit: 1000 })
      if (existingOrders.data?.length > 0) {
        const orderModule = container.resolve("order") as any
        const orderIds = existingOrders.data.map((o: any) => o.id)
        await orderModule.deleteOrders(orderIds)
        process.stderr.write(`[seed]   Deleted ${orderIds.length} orders\n`)
      }
      // Delete customers
      const existingCust = await query.graph({ entity: "customer", fields: ["id"], limit: 1000 })
      if (existingCust.data?.length > 0) {
        const customerModule = container.resolve("customer") as any
        const custIds = existingCust.data.map((c: any) => c.id)
        await customerModule.deleteCustomers(custIds)
        process.stderr.write(`[seed]   Deleted ${custIds.length} customers\n`)
      }
      // Delete inventory levels & items (must be before products — FK via variant link)
      try {
        const inventoryModule = container.resolve("inventory") as any
        const existingItems = await query.graph({ entity: "inventory_item", fields: ["id", "sku"], limit: 2000 })
        if (existingItems.data?.length > 0) {
          // Delete levels first, then items
          const existingLevels = await query.graph({ entity: "inventory_level", fields: ["id"], limit: 2000 })
          if (existingLevels.data?.length > 0) {
            const levelIds = existingLevels.data.map((l: any) => l.id)
            try { await inventoryModule.deleteInventoryLevels(levelIds) } catch {}
            process.stderr.write(`[seed]   Deleted ${levelIds.length} inventory levels\n`)
          }
          const itemIds = existingItems.data.map((i: any) => i.id)
          try { await inventoryModule.deleteInventoryItems(itemIds) } catch (e2: any) {
            process.stderr.write(`[seed]   Inventory item delete warning: ${e2.message?.slice(0,120)}...\n`)
          }
          process.stderr.write(`[seed]   Deleted ${itemIds.length} inventory items\n`)
        }
      } catch (e2: any) {
        process.stderr.write(`[seed]   Inventory cleanup warning: ${e2.message?.slice(0,120)}...\n`)
      }
      // Delete products
      const existingProds = await query.graph({ entity: "product", fields: ["id"], limit: 1000 })
      if (existingProds.data?.length > 0) {
        const productModule = container.resolve("product") as any
        const prodIds = existingProds.data.map((p: any) => p.id)
        await productModule.deleteProducts(prodIds)
        process.stderr.write(`[seed]   Deleted ${prodIds.length} products\n`)
      }
      // Delete categories
      const existingCats = await query.graph({ entity: "product_category", fields: ["id"], limit: 100 })
      if (existingCats.data?.length > 0) {
        const productModule = container.resolve("product") as any
        const catIds = existingCats.data.map((c: any) => c.id)
        await productModule.deleteProductCategories(catIds)
        process.stderr.write(`[seed]   Deleted ${catIds.length} categories\n`)
      }
    } catch (e: any) {
      process.stderr.write(`[seed]   Delete warning: ${e.message?.slice(0,200)}... (continuing)\n`)
    }
  }

  // ── Step 4: Categories ──────────────────────────────────────────
  process.stderr.write("[seed] Step 4/8: Creating categories...\n")

  const categories = [
    { name: "Hardware Supplies", handle: "hardware-supplies", description: "Root category for hardware supplies — bolts, screws, anchors, threaded rods, washers...", rank: 0 },
    // Level 1
    { name: "Bolts", handle: "bu-long", description: "Various types of bolts: hex, carriage, countersunk, full thread, partial thread", parentHandle: "hardware-supplies", rank: 1 },
    { name: "Screws", handle: "oc-vit", description: "Various types of screws: wood screws, self-drilling screws, drywall screws, machine screws", parentHandle: "hardware-supplies", rank: 2 },
    { name: "Nuts", handle: "dai-oc", description: "Various types of nuts: standard, nylon lock, all-metal lock, wing, cap nuts", parentHandle: "hardware-supplies", rank: 3 },
    { name: "Anchors", handle: "tac-ke", description: "Various types of anchors: plastic, metal, expansion — for walls, concrete", parentHandle: "hardware-supplies", rank: 4 },
    { name: "Threaded Rods", handle: "ty-ren", description: "Threaded rods (stud rods) full thread along length, for bracing, hanging", parentHandle: "hardware-supplies", rank: 5 },
    { name: "Washers", handle: "vong-dem", description: "Various types of washers: flat, spring, fender, serrated lock", parentHandle: "hardware-supplies", rank: 6 },
    { name: "Accessories", handle: "phu-kien-khac", description: "Angle brackets, cotter pins, dowel pins, bolt caps...", parentHandle: "hardware-supplies", rank: 7 },
    // Level 2
    { name: "Hex Bolt", handle: "bu-long-luc-giac", description: "Hex head bolt external drive, DIN 931/933 standard", parentHandle: "bu-long", rank: 1 },
    { name: "Carriage Bolt", handle: "bu-long-dau-tron", description: "Carriage bolt square neck anti-rotation", parentHandle: "bu-long", rank: 2 },
    { name: "Countersunk Bolt", handle: "bu-long-dau-chim", description: "Countersunk bolt socket head", parentHandle: "bu-long", rank: 3 },
    { name: "Wood Screw", handle: "vit-go", description: "Wood screw deep thread, flat/pan head, for carpentry and woodwork", parentHandle: "oc-vit", rank: 1 },
    { name: "Self-drilling Screw", handle: "vit-tu-khoan", description: "Self-drilling screw (tek screw) drills through sheet metal without pilot hole", parentHandle: "oc-vit", rank: 2 },
    { name: "Drywall Screw", handle: "vit-ban-ton", description: "Drywall screw bugle head, fine thread", parentHandle: "oc-vit", rank: 3 },
    { name: "Standard Nut", handle: "dai-oc-thuong", description: "Hex nut DIN 934 standard", parentHandle: "dai-oc", rank: 1 },
    { name: "Lock Nut", handle: "dai-oc-khoa", description: "Lock nut: nylon insert, all-metal, flange", parentHandle: "dai-oc", rank: 2 },
    { name: "Wing Nut", handle: "dai-oc-canh", description: "Wing nut hand-tightened without tools", parentHandle: "dai-oc", rank: 3 },
    { name: "Plastic Anchor", handle: "tac-ke-nhua", description: "Plastic anchor (wall plug) PA6, nylon — for walls, lightweight concrete", parentHandle: "tac-ke", rank: 1 },
    { name: "Metal Anchor", handle: "tac-ke-sat", description: "Metal anchor (drop-in anchor) metal expansion, high load capacity", parentHandle: "tac-ke", rank: 2 },
    { name: "Expansion Bolt", handle: "tac-ke-no", description: "Expansion bolt (wedge anchor) for solid concrete", parentHandle: "tac-ke", rank: 3 },
    { name: "Flat Washer", handle: "vong-dem-phang", description: "Flat washer DIN 125, distributes clamping force", parentHandle: "vong-dem", rank: 1 },
    { name: "Spring Washer", handle: "vong-dem-venh", description: "Spring washer DIN 127, prevents self-loosening from vibration", parentHandle: "vong-dem", rank: 2 },
    { name: "Angle Bracket", handle: "ke-goc", description: "90° angle bracket with holes, zinc-plated or stainless steel", parentHandle: "phu-kien-khac", rank: 1 },
    { name: "Split Pin", handle: "chot-che", description: "Split pin (cotter pin) DIN 94, safety pin prevents slipping", parentHandle: "phu-kien-khac", rank: 2 },
  ]

  const catIdMap: Record<string, string> = {}
  const existingCats = await query.graph({ entity: "product_category", fields: ["id", "handle"], limit: 100 })

  for (const cat of categories) {
    const existed = (existingCats.data as any[])?.find((c: any) => c.handle === cat.handle)
    if (existed && !shouldReset) {
      catIdMap[cat.handle] = existed.id
      continue
    }

    const parentId = (cat as any).parentHandle ? catIdMap[(cat as any).parentHandle] : undefined
    if ((cat as any).parentHandle && !parentId) {
      process.stderr.write(`[seed]   WARNING: parent ${(cat as any).parentHandle} not found for ${cat.handle}, skipping\n`)
      continue
    }

    try {
      const { createProductCategoriesWorkflow } = await import("@medusajs/core-flows")
      const catInput: any = {
        product_categories: [{
          name: cat.name,
          handle: cat.handle,
          description: cat.description,
          is_active: true,
          is_internal: false,
          rank: cat.rank,
        }],
      }
      if (parentId) {
        catInput.product_categories[0].parent_category_id = parentId
      }
      const result = await createProductCategoriesWorkflow(container).run({ input: catInput })
      const createdId = (result.result as any)?.id ?? (result.result as any)?.[0]?.id ?? ""
      if (createdId) {
        catIdMap[cat.handle] = createdId
      }
    } catch (e: any) {
      // Fallback: query again
      process.stderr.write(`[seed]   category ${cat.handle} error: ${e.message?.slice(0,80)}... trying query fallback\n`)
      const r = await query.graph({ entity: "product_category", fields: ["id"], filters: { handle: cat.handle } })
      if (r.data?.[0]) {
        catIdMap[cat.handle] = (r.data[0] as any).id
      }
    }
  }
  process.stderr.write(`[seed]   Categories: ${Object.keys(catIdMap).length} created/found\n`)

  // ── Step 5: Product Types ──────────────────────────────────────────
  process.stderr.write("[seed] Step 5/8: Creating product types...\n")
  const productTypeDefs = [
    "Hex Bolt", "Carriage Bolt", "Countersunk Bolt",
    "Wood Screw", "Self-drilling Screw", "Drywall Screw",
    "Standard Nut", "Lock Nut", "Wing Nut",
    "Plastic Anchor", "Metal Anchor", "Expansion Bolt",
    "Threaded Rod", "Flat Washer", "Spring Washer",
    "Angle Bracket", "Split Pin",
  ]

  const typeIdMap: Record<string, string> = {}
  const existingTypes = await query.graph({ entity: "product_type", fields: ["id", "value"], limit: 100 })

  for (const typeValue of productTypeDefs) {
    const existed = (existingTypes.data as any[])?.find((t: any) => t.value === typeValue)
    if (existed && !shouldReset) {
      typeIdMap[typeValue] = existed.id
      continue
    }
    try {
      const productModule = container.resolve("product") as any
      const created = await productModule.createProductTypes([{ value: typeValue }])
      typeIdMap[typeValue] = created?.[0]?.id ?? created?.id ?? ""
    } catch (e: any) {
      process.stderr.write(`[seed]   type ${typeValue} error: ${e.message?.slice(0,80)}...\n`)
      const r = await query.graph({ entity: "product_type", fields: ["id"], filters: { value: typeValue } })
      if (r.data?.[0]) typeIdMap[typeValue] = (r.data[0] as any).id
    }
  }
  process.stderr.write(`[seed]   Product types: ${Object.keys(typeIdMap).length}\n`)

  // ── Step 5b: Product Tags ──────────────────────────────────────────
  process.stderr.write("[seed]   Creating product tags...\n")
  const tagDefs = [
    { value: "bestseller", handle: "bestseller" },
    { value: "premium", handle: "premium" },
    { value: "budget", handle: "budget" },
    { value: "imported", handle: "imported" },
    { value: "domestic", handle: "domestic" },
  ]

  const tagIdMap: Record<string, string> = {}
  const existingTags = await query.graph({ entity: "product_tag", fields: ["id", "value"], limit: 50 })

  for (const tag of tagDefs) {
    const existed = (existingTags.data as any[])?.find((t: any) => t.value === tag.value)
    if (existed && !shouldReset) {
      tagIdMap[tag.handle] = existed.id
      continue
    }
    try {
      const productModule = container.resolve("product") as any
      const created = await productModule.createProductTags([{ value: tag.value }])
      tagIdMap[tag.handle] = created?.[0]?.id ?? created?.id ?? ""
    } catch (e: any) {
      const r = await query.graph({ entity: "product_tag", fields: ["id"], filters: { value: tag.value } })
      if (r.data?.[0]) tagIdMap[tag.handle] = (r.data[0] as any).id
    }
  }
  process.stderr.write(`[seed]   Tags: ${Object.keys(tagIdMap).length}\n`)

  // ── Step 6: Products ───────────────────────────────────────────────
  process.stderr.write("[seed] Step 6/8: Creating products (this may take a while)...\n")
  let productCount = 0
  let variantCount = 0
  const allVariants: { id: string; title: string; product_id: string; sku: string }[] = []

  // Track used SKUs globally to deduplicate collisions
  const usedSkus = new Set<string>()
  const getUniqueSku = (baseSku: string): string => {
    if (!usedSkus.has(baseSku)) {
      usedSkus.add(baseSku)
      return baseSku
    }
    // Append counter for collision cases (same type+material+grade+origin)
    for (let c = 2; c < 100; c++) {
      const candidate = `${baseSku}-${c}`
      if (!usedSkus.has(candidate)) {
        usedSkus.add(candidate)
        return candidate
      }
    }
    // Extreme fallback — random suffix
    const randSuffix = Math.random().toString(36).slice(2, 6).toUpperCase()
    const candidate = `${baseSku}-${randSuffix}`
    usedSkus.add(candidate)
    return candidate
  }

  for (const pdef of PRODUCTS) {
    const typeId = typeIdMap[pdef.typeKey]
    const categoryId = catIdMap[pdef.categoryKey]
    const tagIds = pdef.tags.map((t) => tagIdMap[t]).filter(Boolean)

    if (!categoryId || !typeId) {
      process.stderr.write(`[seed]   SKIP ${pdef.title}: missing category or type\n`)
      continue
    }

    const handle = pdef.title
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)

    // Type prefix map — 2-4 char abbreviations for each product type
    const TYPE_PREFIX: Record<string, string> = {
      "Hex Bolt": "BLG", "Carriage Bolt": "BLT", "Countersunk Bolt": "BLC",
      "Wood Screw": "VTG", "Self-drilling Screw": "VTK", "Drywall Screw": "VBT",
      "Standard Nut": "DOT", "Lock Nut": "DOK", "Wing Nut": "DOC",
      "Plastic Anchor": "TKN", "Metal Anchor": "TKS", "Expansion Bolt": "TKNO",
      "Threaded Rod": "DTR", "Flat Washer": "VDP", "Spring Washer": "VDV",
      "Angle Bracket": "KGC", "Split Pin": "CHC",
    }
    const typePrefix = TYPE_PREFIX[pdef.typeKey] ?? "UKN"
    // Include material+grade+origin in SKU to make it unique per product
    // Format: {TYPE}-{MAT}{GRADE}{ORIGIN}-{SIZE}  e.g. BLG-TC88CN-M8X30
    const skuProductCode = productSkuCode(pdef)

    const variants = pdef.sizes.map((sz) => ({
      title: sz.label,
      sku: getUniqueSku([typePrefix, skuProductCode, sz.skuSuffix].join("-")),
      options: { "Size": sz.label },
      prices: [{ currency_code: "vnd", amount: sz.price }],
      manage_inventory: true,
      allow_backorder: true,  // Wholesale: allow backorders for items restocked frequently
      material: pdef.material,
      origin_country: pdef.originCountry,
    }))

    try {
      const { createProductsWorkflow } = await import("@medusajs/core-flows")
      const result = await createProductsWorkflow(container).run({
        input: {
          products: [{
            title: pdef.title,
            handle,
            description: pdef.description,
            status: "published",
            type_id: typeId,
            category_ids: [categoryId],
            tag_ids: tagIds,
            origin_country: pdef.originCountry,
            material: pdef.material,
            discountable: true,
            options: [
              { title: "Size", values: pdef.sizes.map((s) => s.label) },
            ],
            variants,
          }],
        },
      })
      productCount++

      // Extract variant IDs from result
      const createdProduct = (result.result as any)?.[0] ?? (result.result as any) ?? {}
      const vList = createdProduct.variants ?? []
      for (const v of vList) {
        allVariants.push({ id: v.id, title: v.title, product_id: createdProduct.id ?? "", sku: v.sku ?? "" })
        variantCount++
      }
    } catch (e: any) {
      process.stderr.write(`[seed]   ERROR creating ${pdef.title}: ${e.message?.slice(0,150)}...\n`)
    }
  }

  // Reload variants from DB (in case some weren't captured)
  if (allVariants.length === 0) {
    process.stderr.write("[seed]   Reloading variants from DB...\n")
    const vResult = await query.graph({
      entity: "product_variant",
      fields: ["id", "title", "sku", "product_id"],
      limit: 1000,
    })
    for (const v of (vResult.data ?? []) as any[]) {
      allVariants.push({ id: v.id, title: v.title, product_id: v.product_id, sku: v.sku })
      variantCount++
    }
  }
  process.stderr.write(`[seed]   Products: ${productCount} created, ${variantCount} variants total\n`)

  // ── Step 6.5: Inventory levels ─────────────────────────────────────
  process.stderr.write("[seed] Step 6.5/8: Creating inventory levels...\n")
  try {
    const invItems = await query.graph({
      entity: "inventory_item",
      fields: ["id", "sku"],
      limit: 1000,
    })
    const itemData = (invItems.data ?? []) as any[]
    if (itemData.length > 0 && mainLocationId) {
      const { createInventoryLevelsWorkflow } = await import("@medusajs/core-flows")
      // Process in batches of 50 to avoid overload
      const batchSize = 50
      let levelCount = 0
      for (let i = 0; i < itemData.length; i += batchSize) {
        const batch = itemData.slice(i, i + batchSize)
        try {
          await createInventoryLevelsWorkflow(container).run({
            input: {
              inventory_levels: batch.map((item: any) => ({
                inventory_item_id: item.id,
                location_id: mainLocationId,
                stocked_quantity: rand(100, 10000),
              })),
            },
          })
          levelCount += batch.length
        } catch (e: any) {
          // Levels may already exist — skip
          if (!e.message?.includes("already exists") && !e.message?.includes("unique")) {
            process.stderr.write(`[seed]   Level batch ${i} error: ${e.message?.slice(0,100)}...\n`)
          }
          // Try individual items
          for (const item of batch) {
            try {
              await createInventoryLevelsWorkflow(container).run({
                input: {
                  inventory_levels: [{
                    inventory_item_id: item.id,
                    location_id: mainLocationId,
                    stocked_quantity: rand(100, 10000),
                  }],
                },
              })
              levelCount++
            } catch {
              // skip
            }
          }
        }
      }
      process.stderr.write(`[seed]   Inventory levels: ~${levelCount}\n`)
    } else {
      process.stderr.write(`[seed]   Inventory levels: skipped (${itemData.length} items, location: ${!!mainLocationId})\n`)
    }
  } catch (e: any) {
    process.stderr.write(`[seed]   Inventory levels error: ${e.message?.slice(0,150)}...\n`)
  }

  // ── Step 7: Customers ──────────────────────────────────────────────
  process.stderr.write("[seed] Step 7/8: Creating customers...\n")
  let customerCount = 0
  const allCustomers: { id: string; email: string }[] = []

  for (const cdef of CUSTOMERS) {
    try {
      const { createCustomersWorkflow } = await import("@medusajs/core-flows")
      const result = await createCustomersWorkflow(container).run({
        input: {
          customersData: [{
            company_name: cdef.companyName,
            first_name: cdef.firstName,
            last_name: cdef.lastName,
            email: cdef.email,
            phone: cdef.phone,
            has_account: false,
            addresses: [{
              address_name: "Main Address",
              company: cdef.companyName,
              first_name: cdef.firstName,
              last_name: cdef.lastName,
              address_1: cdef.address1,
              city: cdef.city,
              country_code: "vn",
              province: cdef.province,
              phone: cdef.phone,
              is_default_shipping: true,
              is_default_billing: true,
            }],
          }],
        },
      })
      const created = (result.result as any)?.[0] ?? (result.result as any) ?? {}
      if (created.id) {
        allCustomers.push({ id: created.id, email: cdef.email })
        customerCount++
      }
    } catch (e: any) {
      // If customer already exists, look them up by email
      if (e.message?.includes("already exists")) {
        const r = await query.graph({ entity: "customer", fields: ["id", "email"], filters: { email: cdef.email } })
        const found = (r.data as any)?.[0]
        if (found) {
          allCustomers.push({ id: found.id, email: cdef.email })
          customerCount++
          continue
        }
      }
      process.stderr.write(`[seed]   ERROR customer ${cdef.email}: ${e.message?.slice(0,100)}...\n`)
    }
  }
  process.stderr.write(`[seed]   Customers: ${customerCount}\n`)

  // ── Step 8: Orders ─────────────────────────────────────────────────
  process.stderr.write("[seed] Step 8/8: Creating orders...\n")
  const customers = allCustomers.length > 0 ? allCustomers : ((await query.graph({ entity: "customer", fields: ["id", "email"], limit: 100 })).data ?? []) as any[]
  const variants = allVariants.length > 0 ? allVariants : ((await query.graph({ entity: "product_variant", fields: ["id", "title", "sku", "product_id"], limit: 1000 })).data ?? []) as any[]

  if (customers.length === 0 || variants.length === 0) {
    process.stderr.write(`[seed]   WARNING: Cannot create orders — need customers (${customers.length}) and variants (${variants.length})\n`)
  } else {
    let orderCount = 0
    const orderStatuses = [
      ...Array(60).fill("completed"),
      ...Array(10).fill("pending"),
      ...Array(5).fill("requires_action"),
      ...Array(5).fill("canceled"),
    ]

    for (let i = 0; i < orderStatuses.length; i++) {
      const status = orderStatuses[i]
      const customer = pickOne(customers)
      const daysBack = rand(1, 180)
      const orderDate = daysAgo(daysBack)
      const itemCount = rand(2, 8)
      const orderVariants = pick(variants, itemCount)

      // Build variant details: need product info for each variant
      const variantDetails = await Promise.all(
        orderVariants.map(async (v: any) => {
          try {
            const pResult = await query.graph({
              entity: "product",
              fields: ["id", "title"],
              filters: { id: v.product_id },
            })
            const product = (pResult.data as any)?.[0]
            return {
              variant_id: v.id,
              product_id: v.product_id,
              title: product?.title ?? v.title,
              unit_price: rand(30000, 500000),
              quantity: rand(1, 1000),
            }
          } catch {
            return {
              variant_id: v.id,
              product_id: v.product_id,
              title: v.title,
              unit_price: rand(50000, 300000),
              quantity: rand(1, 500),
            }
          }
        })
      )

      try {
        const { createOrdersWorkflow } = await import("@medusajs/core-flows")
        await createOrdersWorkflow(container).run({
          input: {
            region_id: regionId,
            customer_id: customer.id,
            email: customer.email,
            sales_channel_id: salesChannelId,
            currency_code: "vnd",
            status,
            shipping_address: {
              first_name: customer.first_name ?? "",
              last_name: customer.last_name ?? "",
              address_1: "Shipping Address",
              city: "TP. Hồ Chí Minh",
              country_code: "vn",
            },
            billing_address: {
              first_name: customer.first_name ?? "",
              last_name: customer.last_name ?? "",
              address_1: "Billing Address",
              city: "TP. Hồ Chí Minh",
              country_code: "vn",
            },
            items: variantDetails.map((vd) => ({
              variant_id: vd.variant_id,
              product_id: vd.product_id,
              title: vd.title,
              quantity: vd.quantity,
              unit_price: vd.unit_price,
            })),
          },
        })
        orderCount++
      } catch (e: any) {
        // Some errors are expected (e.g., inventory issues for variant-less products)
        if (orderCount < 5) {
          process.stderr.write(`[seed]   Order ${i} error: ${e.message?.slice(0,120)}...\n`)
        }
      }
    }
    process.stderr.write(`[seed]   Orders: ${orderCount}\n`)
  }

  // ── Done ───────────────────────────────────────────────────────────
  const summary = {
    ok: true,
    action: shouldReset ? "reset+seed" : "seed",
    products: productCount,
    variants: variantCount,
    customers: customerCount,
    categories: Object.keys(catIdMap).length,
    product_types: Object.keys(typeIdMap).length,
    tags: Object.keys(tagIdMap).length,
    region_id: regionId,
    sales_channel_id: salesChannelId,
    main_location_id: mainLocationId,
  }
  console.log(JSON.stringify(summary, null, 2))
  process.stderr.write("\n[seed] Done! KAMI hardware store data seeded successfully.\n")
  process.stderr.write("[seed] Visit admin UI → Products / Customers / Orders to verify.\n")
}
