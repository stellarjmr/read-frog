import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const renderCaskScript = fileURLToPath(new URL("../render-homebrew-cask.mjs", import.meta.url))
const packageSafariAppScript = fileURLToPath(new URL("../package-safari-app.mjs", import.meta.url))
const configureReleaseSecretsScript = fileURLToPath(
  new URL("../configure-apple-release-secrets.sh", import.meta.url),
)
const temporaryDirectories: string[] = []

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "read-frog-distribution-"))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  )
})

describe("Homebrew cask renderer", () => {
  it("renders the stable Safari app release contract", async () => {
    const directory = await createTemporaryDirectory()
    const outputPath = path.join(directory, "read-frog.rb")
    const checksum = "a".repeat(64)

    const result = spawnSync(
      process.execPath,
      [renderCaskScript, "--version", "2.0.0", "--sha256", checksum, "--output", outputPath],
      { encoding: "utf8" },
    )

    expect(result.status).toBe(0)
    const cask = await readFile(outputPath, "utf8")
    expect(cask).toContain('cask "read-frog"')
    expect(cask).toContain('version "2.0.0"')
    expect(cask).toContain(`sha256 "${checksum}"`)
    expect(cask).toContain(
      'url "https://github.com/stellarjmr/read-frog/releases/download/v#{version}/Read-Frog-#{version}-macos.zip"',
    )
    expect(cask).toContain("depends_on macos: :sequoia")
    expect(cask).toContain('app "Read Frog.app"')
    expect(cask).toContain('"~/Library/Containers/com.zhimin.readfrog.Extension"')
  })

  it("rejects invalid versions and checksums", async () => {
    const directory = await createTemporaryDirectory()
    const outputPath = path.join(directory, "read-frog.rb")

    const invalidVersion = spawnSync(
      process.execPath,
      [renderCaskScript, "--version", "latest", "--sha256", "a".repeat(64), "--output", outputPath],
      { encoding: "utf8" },
    )
    expect(invalidVersion.status).not.toBe(0)
    expect(invalidVersion.stderr).toContain("--version must be a semantic version")

    const invalidChecksum = spawnSync(
      process.execPath,
      [
        renderCaskScript,
        "--version",
        "2.0.0",
        "--sha256",
        "not-a-checksum",
        "--output",
        outputPath,
      ],
      { encoding: "utf8" },
    )
    expect(invalidChecksum.status).not.toBe(0)
    expect(invalidChecksum.stderr).toContain("--sha256 must be a lowercase SHA-256 digest")
  })
})

describe("Safari app packager arguments", () => {
  it("requires exactly one signing mode and notarization only with signing", () => {
    for (const argumentsList of [[], ["--signed", "--unsigned"], ["--unsigned", "--notarize"]]) {
      const result = spawnSync(process.execPath, [packageSafariAppScript, ...argumentsList], {
        encoding: "utf8",
      })
      expect(result.status).toBe(2)
      expect(result.stderr).toContain(
        "Usage: package-safari-app.mjs (--unsigned | --signed [--notarize])",
      )
    }
  })
})

describe("Apple release secret helper interface", () => {
  it("shows usage without prompting for credentials", () => {
    const result = spawnSync("bash", [configureReleaseSecretsScript, "--help"], {
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("--certificate /path/to/developer-id.p12")
    expect(result.stdout).toContain("never written to the repository")
  })

  it("rejects an option without a value before reading credentials", () => {
    const result = spawnSync("bash", [configureReleaseSecretsScript, "--certificate"], {
      encoding: "utf8",
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain("Missing value for --certificate")
  })
})
