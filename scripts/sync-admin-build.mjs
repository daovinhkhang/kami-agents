import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const targetDir = path.join(root, "public", "admin")

// Medusa admin build output paths:
// - Development (medusa develop): .medusa/admin/
// - Production (medusa build):   dist/public/admin/
const candidateDirs = [
  path.join(root, "dist", "public", "admin"),
  path.join(root, ".medusa", "admin"),
]

let sourceDir = null
for (const dir of candidateDirs) {
  const indexPath = path.join(dir, "index.html")
  if (fs.existsSync(indexPath)) {
    sourceDir = dir
    break
  }
}

if (!sourceDir) {
  console.error(
    `[sync-admin-build] No admin build found in: ${candidateDirs.join(", ")}`
  )
  process.exit(1)
}

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(path.dirname(targetDir), { recursive: true })
fs.cpSync(sourceDir, targetDir, { recursive: true })

console.log(`[sync-admin-build] Synced ${sourceDir} -> ${targetDir}`)
