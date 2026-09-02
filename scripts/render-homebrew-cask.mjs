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

  url "https://github.com/stellarjmr/read-frog/releases/download/v#{version}/Read-Frog-#{version}-macos.zip"
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
    Open Read Frog once after installation, then enable it in
    Safari > Settings > Extensions and grant the desired website access.
  EOS
end
`

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, cask)
console.log(`Rendered ${outputPath}`)
