import { access, readFile, readdir } from "node:fs/promises"
import path from "node:path"

const buildDirectory = path.resolve(process.argv[2] ?? ".output/safari-mv3")
const manifestPath = path.join(buildDirectory, "manifest.json")
const errors = []

function check(condition, message) {
  if (!condition) errors.push(message)
}

function collectMatchPatterns(manifest) {
  return [
    ...(manifest.host_permissions ?? []),
    ...(manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []),
    ...(manifest.web_accessible_resources ?? []).flatMap((resource) => resource.matches ?? []),
  ]
}

async function fileExists(relativePath) {
  try {
    await access(path.join(buildDirectory, relativePath))
    return true
  } catch {
    return false
  }
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relativePath)))
    } else {
      files.push(relativePath)
    }
  }

  return files
}

let manifest
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"))
} catch (error) {
  console.error(`Unable to read Safari manifest at ${manifestPath}`)
  console.error(error)
  process.exit(1)
}

check(manifest.manifest_version === 3, "manifest_version must be 3")
check(
  manifest.browser_specific_settings?.safari?.strict_min_version === "18.0",
  "Safari strict_min_version must be 18.0",
)
check(
  !manifest.browser_specific_settings?.gecko,
  "Firefox browser_specific_settings.gecko must not be present",
)
check(manifest.background?.service_worker === "background.js", "background worker is missing")
check(manifest.action?.default_popup === "popup.html", "Safari toolbar popup is missing")
check(manifest.options_ui?.page === "options.html", "Safari options page is missing")

const forbiddenPermissions = ["identity", "offscreen", "sidePanel"]
const declaredPermissions = new Set([
  ...(manifest.permissions ?? []),
  ...(manifest.optional_permissions ?? []),
])
for (const permission of forbiddenPermissions) {
  check(!declaredPermissions.has(permission), `unsupported permission is present: ${permission}`)
}

for (const key of ["side_panel", "sidebar_action"]) {
  check(!(key in manifest), `unsupported manifest key is present: ${key}`)
}

for (const matchPattern of collectMatchPatterns(manifest)) {
  check(!matchPattern.startsWith("file://"), `file URL access is present: ${matchPattern}`)
}

for (const requiredFile of ["background.js", "popup.html", "options.html"]) {
  check(await fileExists(requiredFile), `required build file is missing: ${requiredFile}`)
}

const generatedFiles = await listFiles(buildDirectory)
for (const forbiddenName of ["offscreen", "sidepanel"]) {
  check(
    !generatedFiles.some((file) => file.toLowerCase().includes(forbiddenName)),
    `removed ${forbiddenName} entrypoint is still present in the build`,
  )
}

if (errors.length > 0) {
  console.error("Safari build verification failed:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Safari WebExtension verified: ${buildDirectory}`)
