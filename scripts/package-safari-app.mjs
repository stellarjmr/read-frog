import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { access, appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const argumentsSet = new Set(process.argv.slice(2))
const signed = argumentsSet.has("--signed")
const unsigned = argumentsSet.has("--unsigned")
const notarize = argumentsSet.has("--notarize")

if (signed === unsigned || (notarize && !signed)) {
  console.error("Usage: package-safari-app.mjs (--unsigned | --signed [--notarize])")
  process.exit(2)
}

const packageJson = JSON.parse(await readFile(path.join(rootDirectory, "package.json"), "utf8"))
const version = packageJson.version
const appName = "Read Frog"
const bundleIdentifier = process.env.MACOS_BUNDLE_IDENTIFIER ?? "com.zhimin.readfrog"
const buildNumber =
  process.env.MACOS_BUILD_NUMBER ??
  version
    .split(".")
    .slice(0, 3)
    .reduce((value, part, index) => value + Number.parseInt(part, 10) * 1000 ** (2 - index), 0)
    .toString()
const extensionDirectory = path.join(rootDirectory, ".output", "safari-mv3")
const buildDirectory = path.join(rootDirectory, "build", "safari-app")
const projectDirectory = path.join(buildDirectory, "project")
const derivedDataDirectory = path.join(buildDirectory, "DerivedData")
const stagingDirectory = path.join(buildDirectory, "release")
const stagedAppPath = path.join(stagingDirectory, `${appName}.app`)
const distributionDirectory = path.join(rootDirectory, "dist")
const artifactName = signed
  ? `Read-Frog-${version}-macos.zip`
  : `Read-Frog-${version}-macos-unsigned.zip`
const artifactPath = path.join(distributionDirectory, artifactName)

function run(command, args, options = {}) {
  const capture = options.capture ?? false
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = capture ? `\n${result.stderr || result.stdout}` : ""
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}${detail}`)
  }

  return result.stdout ?? ""
}

function hasXcrunTool(tool) {
  return spawnSync("xcrun", ["--find", tool], { stdio: "ignore" }).status === 0
}

async function findDirectories(directory, predicate) {
  const matches = []
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const entryPath = path.join(directory, entry.name)
    if (predicate(entryPath, entry.name)) matches.push(entryPath)
    matches.push(...(await findDirectories(entryPath, predicate)))
  }

  return matches
}

async function sha256(filePath) {
  const hash = createHash("sha256")
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve)
  })
  return hash.digest("hex")
}

async function createZip() {
  await rm(artifactPath, { force: true })
  run("ditto", ["-c", "-k", "--keepParent", "--noextattr", "--norsrc", stagedAppPath, artifactPath])
}

await access(path.join(extensionDirectory, "manifest.json")).catch(() => {
  throw new Error("Missing .output/safari-mv3/manifest.json; run pnpm build first")
})

run("xcodebuild", ["-version"], { capture: true })

const packager = hasXcrunTool("safari-web-extension-packager")
  ? "safari-web-extension-packager"
  : hasXcrunTool("safari-web-extension-converter")
    ? "safari-web-extension-converter"
    : null

if (!packager) {
  throw new Error(
    "Safari Web Extension Packager is unavailable. Install full Xcode; Command Line Tools are insufficient.",
  )
}

if (signed) {
  const signingIdentity = process.env.MACOS_SIGNING_IDENTITY
  const teamIdentifier = process.env.APPLE_TEAM_ID
  if (!signingIdentity || !teamIdentifier) {
    throw new Error("MACOS_SIGNING_IDENTITY and APPLE_TEAM_ID are required for a signed package")
  }

  const identities = run("security", ["find-identity", "-v", "-p", "codesigning"], {
    capture: true,
  })
  if (!identities.includes(signingIdentity)) {
    throw new Error("The requested MACOS_SIGNING_IDENTITY is not installed in the active keychain")
  }
}

await rm(buildDirectory, { recursive: true, force: true })
await mkdir(buildDirectory, { recursive: true })
await mkdir(distributionDirectory, { recursive: true })

run("xcrun", [
  packager,
  extensionDirectory,
  "--project-location",
  projectDirectory,
  "--app-name",
  appName,
  "--bundle-identifier",
  bundleIdentifier,
  "--swift",
  "--macos-only",
  "--copy-resources",
  "--no-open",
  "--no-prompt",
  "--force",
])

const projects = await findDirectories(projectDirectory, (_entryPath, name) =>
  name.endsWith(".xcodeproj"),
)
if (projects.length !== 1) {
  throw new Error(`Expected one generated Xcode project, found ${projects.length}`)
}

const projectPath = projects[0]
const projectFilePath = path.join(projectPath, "project.pbxproj")
const generatedProject = await readFile(projectFilePath, "utf8")
let appBundleIdentifierCount = 0
let extensionBundleIdentifierCount = 0
const configuredProject = generatedProject.replace(
  /(PRODUCT_BUNDLE_IDENTIFIER\s*=\s*)([^;]+)(;)/g,
  (_match, prefix, rawIdentifier, suffix) => {
    const generatedIdentifier = rawIdentifier.trim().replace(/^"|"$/g, "")
    if (/\.Extension$/i.test(generatedIdentifier)) {
      extensionBundleIdentifierCount += 1
      return `${prefix}${bundleIdentifier}.Extension${suffix}`
    }

    appBundleIdentifierCount += 1
    return `${prefix}${bundleIdentifier}${suffix}`
  },
)
if (appBundleIdentifierCount === 0 || extensionBundleIdentifierCount === 0) {
  throw new Error("Unable to configure app and extension bundle identifiers in the Xcode project")
}
await writeFile(projectFilePath, configuredProject)

const projectListing = JSON.parse(
  run("xcodebuild", ["-project", projectPath, "-list", "-json"], { capture: true }),
)
const schemes = projectListing.project?.schemes ?? projectListing.workspace?.schemes ?? []
const scheme =
  process.env.MACOS_SCHEME ??
  schemes.find((candidate) => !/extension/i.test(candidate)) ??
  schemes[0]
if (!scheme) throw new Error("The generated Xcode project has no shared build scheme")

const buildArguments = [
  "-project",
  projectPath,
  "-scheme",
  scheme,
  "-configuration",
  "Release",
  "-destination",
  "generic/platform=macOS",
  "-derivedDataPath",
  derivedDataDirectory,
  `MARKETING_VERSION=${version}`,
  `CURRENT_PROJECT_VERSION=${buildNumber}`,
  "MACOSX_DEPLOYMENT_TARGET=15.0",
  "ONLY_ACTIVE_ARCH=NO",
  "ARCHS=arm64 x86_64",
]

if (signed) {
  buildArguments.push(
    "CODE_SIGNING_ALLOWED=YES",
    "CODE_SIGN_STYLE=Manual",
    `CODE_SIGN_IDENTITY=${process.env.MACOS_SIGNING_IDENTITY}`,
    `DEVELOPMENT_TEAM=${process.env.APPLE_TEAM_ID}`,
    "ENABLE_HARDENED_RUNTIME=YES",
    "OTHER_CODE_SIGN_FLAGS=--timestamp",
  )
} else {
  buildArguments.push("CODE_SIGNING_ALLOWED=NO")
}

buildArguments.push("build")
run("xcodebuild", buildArguments)

const applications = await findDirectories(
  path.join(derivedDataDirectory, "Build", "Products"),
  (_entryPath, name) => name.endsWith(".app"),
)
const builtAppPath =
  applications.find((candidate) => path.basename(candidate) === `${appName}.app`) ?? applications[0]
if (!builtAppPath) throw new Error("The generated macOS app was not found")

await rm(stagingDirectory, { recursive: true, force: true })
await mkdir(stagingDirectory, { recursive: true })
run("ditto", ["--noextattr", "--norsrc", builtAppPath, stagedAppPath])

if (unsigned) {
  run("codesign", ["--force", "--deep", "--sign", "-", stagedAppPath])
}

run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", stagedAppPath])
await createZip()

if (notarize) {
  const notaryKeyPath = process.env.APPLE_NOTARY_KEY_PATH
  const notaryKeyIdentifier = process.env.APPLE_NOTARY_KEY_ID
  const notaryIssuerIdentifier = process.env.APPLE_NOTARY_ISSUER_ID
  if (!notaryKeyPath || !notaryKeyIdentifier || !notaryIssuerIdentifier) {
    throw new Error(
      "APPLE_NOTARY_KEY_PATH, APPLE_NOTARY_KEY_ID, and APPLE_NOTARY_ISSUER_ID are required",
    )
  }

  run("xcrun", [
    "notarytool",
    "submit",
    artifactPath,
    "--key",
    notaryKeyPath,
    "--key-id",
    notaryKeyIdentifier,
    "--issuer",
    notaryIssuerIdentifier,
    "--wait",
  ])
  run("xcrun", ["stapler", "staple", stagedAppPath])
  run("xcrun", ["stapler", "validate", stagedAppPath])
  await createZip()
  run("spctl", ["--assess", "--type", "execute", "--verbose=2", stagedAppPath])
}

const checksum = await sha256(artifactPath)
const outputLines = {
  app_path: stagedAppPath,
  artifact_path: artifactPath,
  artifact_name: artifactName,
  sha256: checksum,
  version,
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(outputLines)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
  )
}

console.log(`Built ${path.relative(rootDirectory, artifactPath)}`)
console.log(`sha256: ${checksum}`)
