import { access, readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const errors = []

function check(condition, message) {
  if (!condition) errors.push(message)
}

async function read(relativePath) {
  return readFile(path.join(rootDirectory, relativePath), "utf8")
}

async function exists(relativePath) {
  try {
    await access(path.join(rootDirectory, relativePath))
    return true
  } catch {
    return false
  }
}

async function containsFiles(relativePath) {
  try {
    const entries = await readdir(path.join(rootDirectory, relativePath), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) return true
      if (entry.isDirectory() && (await containsFiles(path.join(relativePath, entry.name)))) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

const packageJson = JSON.parse(await read("package.json"))
const scripts = packageJson.scripts ?? {}

for (const scriptName of ["build", "build:analyze", "dev", "dev:local", "zip"]) {
  const command = scripts[scriptName]
  check(typeof command === "string", `package script is missing: ${scriptName}`)
  if (typeof command !== "string") continue

  check(command.includes("-b safari"), `${scriptName} must explicitly target Safari`)
  check(command.includes("--mv3"), `${scriptName} must explicitly target Manifest V3`)
}

for (const [scriptName, command] of Object.entries(scripts)) {
  if (!/^(?:build|dev|zip)(?::|$)/.test(scriptName)) continue
  check(
    !/(?:^|[\s:-])(chrome|edge|firefox)(?:$|[\s:-])/i.test(`${scriptName} ${command}`),
    `non-Safari browser target is present in package script: ${scriptName}`,
  )
}

check(
  scripts["package:macos:release"]?.includes("--signed") &&
    scripts["package:macos:release"]?.includes("--notarize"),
  "package:macos:release must require signing and notarization",
)

const wxtConfig = await read("wxt.config.ts")
check(/browser:\s*["']safari["']/.test(wxtConfig), "WXT default browser must be Safari")
check(
  /targetBrowsers:\s*\[\s*["']safari["']\s*\]/.test(wxtConfig),
  "WXT targetBrowsers must contain only Safari",
)
check(/manifestVersion:\s*3\b/.test(wxtConfig), "WXT manifest version must be 3")
check(
  /strict_min_version:\s*["']18\.0["']/.test(wxtConfig),
  "Safari strict_min_version must remain 18.0",
)
check(!/browser_specific_settings[\s\S]*?gecko\s*:/.test(wxtConfig), "Firefox gecko settings exist")

for (const entrypoint of ["src/entrypoints/offscreen", "src/entrypoints/sidepanel"]) {
  check(!(await containsFiles(entrypoint)), `unsupported Safari entrypoint exists: ${entrypoint}`)
}

const changesetConfig = JSON.parse(await read(".changeset/config.json"))
check(
  changesetConfig.changelog?.[1]?.repo === "stellarjmr/read-frog",
  "Changesets changelog repository must point to the Safari fork",
)

for (const requiredFile of ["AGENTS.md", "STATUS.md", "scripts/package-safari-app.mjs"]) {
  check(await exists(requiredFile), `fork engineering file is missing: ${requiredFile}`)
}

if (errors.length > 0) {
  console.error("Safari fork policy verification failed:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log("Safari fork policy verified")
