import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

assert.ok(process.argv[2], "Usage: node safari/verify-app-icon.mjs <application.app>")
const resources = path.resolve(process.argv[2], "Contents/Resources")
assert.ok(existsSync(path.join(resources, "AppIcon.icns")), "Missing legacy macOS app icon")
// Use Xcode's standalone assetutil, which also reads macOS catalogs. The host
// /usr/bin/assetutil on macOS 15 CI runners predates layered app icons.
const assets = JSON.parse(
  execFileSync("xcrun", [
    "--sdk",
    "iphoneos",
    "assetutil",
    "--info",
    path.join(resources, "Assets.car"),
  ]),
)
const icons = assets.filter(
  (asset) => asset.Name === "AppIcon" && asset.AssetType === "IconImageStack",
)
const light = icons.find((icon) => icon.Appearance === "NSAppearanceNameAqua")
const dark = icons.find((icon) => icon.Appearance === "NSAppearanceNameDarkAqua")
assert.ok(light, "Missing layered light app icon")
assert.ok(dark, "Missing layered dark app icon")
assert.notEqual(light.SHA1Digest, dark.SHA1Digest, "Light and dark app icons must differ")
console.log("Safari app icon verified: layered light/dark appearances and legacy .icns")
