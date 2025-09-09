import * as Glob from "glob"
import * as Fs from "node:fs"

const dirs = [".", ...Glob.sync("packages/*/"), ...Glob.sync("apps/*/")]

dirs.forEach((pkg) => {
  const folders = [".tsbuildinfo", "build", "dist", "coverage"]
  folders.forEach((folder) => {
    Fs.rmSync(`${pkg}/${folder}`, { recursive: true, force: true })
  })

  // Remove stray compiled artifacts accidentally emitted into source trees
  const strayPatterns = [
    `${pkg}/src/**/*.js`,
    `${pkg}/src/**/*.js.map`,
    `${pkg}/src/**/*.d.ts`,
    `${pkg}/src/**/*.d.ts.map`
  ]
  strayPatterns.forEach((pattern) => {
    for (const file of Glob.sync(pattern, { nodir: true })) {
      try {
        Fs.rmSync(file, { force: true })
      } catch {
        // Ignore errors if the file doesn't exist
      }
    }
  })
})
