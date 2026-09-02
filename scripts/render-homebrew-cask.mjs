import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const version = readArgument("--version")
const checksum = readArgument("--sha256")
const outputPath = path.resolve(readArgument("--output") ?? "dist/read-frog.rb")

if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error("--version must be a semantic version")
}
if (!checksum || !/^[a-f0-9]{64}$/.test(checksum)) {
  throw new Error("--sha256 must be a lowercase SHA-256 digest")
}

const cask = `# typed: strict
# frozen_string_literal: true

cask "read-frog" do
  version "${version}"
  sha256 "${checksum}"

  url "https://github.com/stellarjmr/read-frog/releases/download/v#{version}/Read-Frog-#{version}-macos-unsigned.zip"
  name "Read Frog"
  desc "AI-powered language learning extension for Safari"
  homepage "https://github.com/stellarjmr/read-frog"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :sequoia

  app "Read Frog.app"

  zap trash: [
    "~/Library/Containers/com.zhimin.readfrog",
    "~/Library/Containers/com.zhimin.readfrog.Extension",
  ]

  caveats <<~EOS
    This Homebrew release is ad-hoc signed and is not notarized by Apple.
    macOS may block the first launch. If it does, open System Settings >
    Privacy & Security and choose Open Anyway for Read Frog.

    Safari ignores unsigned extensions by default. In Safari 17 or later:
      1. Safari > Settings > Advanced > Show features for web developers
      2. Safari > Settings > Developer > Allow unsigned extensions
      3. Open Read Frog once, then enable it in Settings > Extensions

    Safari resets "Allow unsigned extensions" whenever Safari quits.
  EOS
end
`

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, cask)
console.log(`Rendered ${outputPath}`)
