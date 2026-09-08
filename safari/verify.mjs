import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const directory = path.resolve(process.argv[2] ?? ".output/safari-mv3")
const manifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8"))
assert.equal(manifest.manifest_version, 3)
assert.equal(manifest.background?.type, "module")
assert.equal(manifest.background?.persistent, false)
assert.ok(manifest.background?.scripts?.length, "Safari needs a DOM background for audio")
assert.ok(!manifest.background.service_worker)
assert.ok(!manifest.side_panel)
for (const permission of ["identity", "offscreen", "sidePanel"]) {
  assert.ok(!manifest.permissions?.includes(permission), `Unsupported permission: ${permission}`)
}
for (const file of [
  ...manifest.background.scripts,
  manifest.action.default_popup,
  manifest.options_ui.page,
  "sidepanel.html",
  ...manifest.content_scripts.flatMap((script) => [...script.js, ...(script.css ?? [])]),
]) {
  assert.ok(existsSync(path.join(directory, file)), `Missing extension resource: ${file}`)
}
assert.ok(manifest.content_scripts.length > 0)
assert.ok(manifest.host_permissions.includes("*://*/*"))
console.log(`Safari manifest and entrypoint resources verified (${manifest.version})`)
