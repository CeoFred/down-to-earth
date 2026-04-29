import { existsSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

if (process.platform === "darwin") {
  const outDir = join(process.cwd(), "out")

  if (existsSync(outDir)) {
    spawnSync("xattr", ["-dr", "com.apple.provenance", outDir], {
      stdio: "ignore",
    })
  }
}
