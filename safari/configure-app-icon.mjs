import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

assert.ok(process.argv[2], "Usage: node safari/configure-app-icon.mjs <project.pbxproj> <app-name>")
assert.ok(process.argv[3], "Missing Safari app name")
const projectFile = path.resolve(process.argv[2])
const projectRoot = path.dirname(path.dirname(projectFile))
const project = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", projectFile]))
const { objects } = project
const appNames = [process.argv[3], `${process.argv[3]} (macOS)`]
const targets = Object.values(objects).filter(
  (object) =>
    object.productType === "com.apple.product-type.application" && appNames.includes(object.name),
)
assert.equal(targets.length, 1, "Expected one macOS application target")
const resourcePhases = targets[0].buildPhases.filter(
  (id) => objects[id].isa === "PBXResourcesBuildPhase",
)
assert.equal(resourcePhases.length, 1, "Expected one application resources phase")
const mainGroup = objects[project.rootObject].mainGroup

// Keep the exported Xcode project self-contained without duplicating the original
// artwork in source control. Xcode generates legacy .icns as well as modern icons.
const iconDirectory = path.join(projectRoot, "AppIcon.icon")
mkdirSync(path.join(iconDirectory, "Assets"), { recursive: true })
copyFileSync(path.join(import.meta.dirname, "app-icon.json"), path.join(iconDirectory, "icon.json"))
copyFileSync(
  path.join(import.meta.dirname, "../assets/read-frog-original.png"),
  path.join(iconDirectory, "Assets/read-frog-original.png"),
)
// The converter's flattened white tiles must not compete with the layered icon.
for (const entry of readdirSync(projectRoot, { recursive: true })) {
  if (path.basename(entry) === "AppIcon.appiconset") {
    rmSync(path.join(projectRoot, entry), { recursive: true })
  }
}

const existingReference = Object.entries(objects).find(
  ([, object]) => object.isa === "PBXFileReference" && object.path === "AppIcon.icon",
)
if (existingReference) {
  assert.ok(
    objects[resourcePhases[0]].files.some((id) => objects[id].fileRef === existingReference[0]),
    "Existing AppIcon.icon must belong to the macOS application target",
  )
} else {
  const referenceID = randomBytes(12).toString("hex").toUpperCase()
  const buildID = randomBytes(12).toString("hex").toUpperCase()
  let content = readFileSync(projectFile, "utf8")
  const replaceRequired = (pattern, replacement) => {
    const updated = content.replace(pattern, replacement)
    assert.notEqual(updated, content, `Unexpected Xcode project: missing ${pattern}`)
    content = updated
  }
  // Preserve the converter's OpenStep format and comments. Resolve target IDs
  // through plutil instead of guessing which Resources phase is the application.
  replaceRequired(
    "/* Begin PBXFileReference section */",
    `/* Begin PBXFileReference section */\n\t\t${referenceID} /* AppIcon.icon */ = {isa = PBXFileReference; lastKnownFileType = folder.iconcomposer.icon; path = AppIcon.icon; sourceTree = SOURCE_ROOT; };`,
  )
  replaceRequired(
    "/* Begin PBXBuildFile section */",
    `/* Begin PBXBuildFile section */\n\t\t${buildID} /* AppIcon.icon in Resources */ = {isa = PBXBuildFile; fileRef = ${referenceID} /* AppIcon.icon */; };`,
  )
  for (const [id, list, entry] of [
    [mainGroup, "children", `${referenceID} /* AppIcon.icon */`],
    [resourcePhases[0], "files", `${buildID} /* AppIcon.icon in Resources */`],
  ]) {
    replaceRequired(
      new RegExp(`(\\b${id}(?: /\\*[^\\n]*\\*/)? = \\{[\\s\\S]*?\\b${list} = \\(\\n)`),
      `$1\t\t\t\t${entry},\n`,
    )
  }
  writeFileSync(projectFile, content)
}
console.log("Safari app icon configured with original artwork and automatic light/dark backgrounds")
