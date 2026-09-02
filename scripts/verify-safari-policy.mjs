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

async function listFiles(relativePath) {
  const files = []
  const entries = await readdir(path.join(rootDirectory, relativePath), { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(relativePath, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(entryPath)))
    else if (entry.isFile()) files.push(entryPath)
  }

  return files
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

const sourceFiles = (await listFiles("src")).filter((file) =>
  /\.(?:html|js|jsx|ts|tsx)$/.test(file),
)
const unsupportedSourcePatterns = [
  [/\b(?:browser|chrome)\.(?:identity|offscreen|sidePanel)\b/, "unsupported extension API"],
  [/\b(?:browser|chrome)\.runtime\.setUninstallURL\b/, "unsupported uninstall URL API"],
  [/(?:chrome|moz)-extension:\/\//, "non-Safari extension URL"],
  [/import\.meta\.env\.(?:CHROME|EDGE|FIREFOX|OPERA)\b/, "non-Safari compile-time browser branch"],
  [
    /import\.meta\.env\.BROWSER\s*===?\s*["'](?:chrome|edge|firefox|opera)["']/,
    "non-Safari runtime browser branch",
  ],
]

for (const file of sourceFiles) {
  const source = await read(file)
  for (const [pattern, description] of unsupportedSourcePatterns) {
    check(!pattern.test(source), `${description} is present in ${file}`)
  }
}

const changesetConfig = JSON.parse(await read(".changeset/config.json"))
check(
  changesetConfig.changelog?.[1]?.repo === "stellarjmr/read-frog",
  "Changesets changelog repository must point to the Safari fork",
)

const releaseWorkflow = await read(".github/workflows/release.yml")
check(
  releaseWorkflow.includes("needs: [plan, credentials]"),
  "release metadata must wait for Apple credential preflight",
)
check(
  releaseWorkflow.includes("actions: write") &&
    releaseWorkflow.includes("steps.changesets.outputs.pr-number") &&
    releaseWorkflow.includes("/approve"),
  "release workflow must approve checks only for its trusted Changesets pull request",
)
check(
  releaseWorkflow.includes("xcrun notarytool history"),
  "release workflow must authenticate with the notary service before tagging",
)
check(
  releaseWorkflow.includes("node scripts/package-safari-app.mjs --signed --notarize"),
  "stable release workflow must build a signed and notarized app",
)
check(
  releaseWorkflow.includes("node scripts/render-homebrew-cask.mjs"),
  "stable release workflow must render Homebrew cask metadata",
)

for (const secret of [
  "MACOS_CERTIFICATE_P12",
  "MACOS_CERTIFICATE_PASSWORD",
  "MACOS_SIGNING_IDENTITY",
  "APPLE_TEAM_ID",
  "APPLE_NOTARY_KEY_ID",
  "APPLE_NOTARY_ISSUER_ID",
  "APPLE_NOTARY_PRIVATE_KEY",
]) {
  check(releaseWorkflow.includes(`secrets.${secret}`), `release secret is not wired: ${secret}`)
}

const packagingWorkflow = await read(".github/workflows/submit.yml")
check(
  packagingWorkflow.includes("node scripts/package-safari-app.mjs --signed") &&
    packagingWorkflow.includes("Read Frog CI Code Signing") &&
    packagingWorkflow.includes('grep -Fq "runtime"'),
  "macOS smoke workflow must exercise the signed Xcode build path and hardened runtime",
)
check(
  packagingWorkflow.includes("node scripts/package-safari-app.mjs --unsigned"),
  "macOS smoke workflow must retain the unsigned diagnostic artifact",
)

const caskRenderer = await read("scripts/render-homebrew-cask.mjs")
for (const fragment of [
  'cask "read-frog"',
  "stellarjmr/read-frog/releases/download/v#{version}/Read-Frog-#{version}-macos.zip",
  'app "Read Frog.app"',
  "com.zhimin.readfrog.Extension",
]) {
  check(caskRenderer.includes(fragment), `Homebrew cask contract is missing: ${fragment}`)
}

for (const requiredFile of [
  "AGENTS.md",
  "STATUS.md",
  "UPSTREAM_SYNC.md",
  "HOMEBREW_RELEASE.md",
  ".github/workflows/sync-upstream.yml",
  "scripts/package-safari-app.mjs",
]) {
  check(await exists(requiredFile), `fork engineering file is missing: ${requiredFile}`)
}

if (errors.length > 0) {
  console.error("Safari fork policy verification failed:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log("Safari fork policy verified")
