$ErrorActionPreference = "Stop"

$path = "C:\Users\adahn\Downloads\ai blue project\Project Blue App\desktop_pet\test\upgrade-sync.test.cjs"
$utf8 = [System.Text.UTF8Encoding]::new($false)
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$marker = 'test("shared sync protects uncommitted edits", () => {'
$index = $text.IndexOf($marker)
if ($index -lt 0) {
  throw "Could not find test marker."
}
$prefix = $text.Substring(0, $index)
$tail = @'
test("shared sync protects uncommitted edits", () => {
  const parsed = parseBranchStatus([
    "## main...origin/main",
    " M Project Blue App/desktop_pet/main.cjs",
    "?? notes.md"
  ].join("\n"));
  assert.equal(parsed.clean, false);
  assert.equal(parsed.changes.length, 2);
  assert.equal(classifySyncState(parsed), "local-uncommitted-changes");
});
'@
[System.IO.File]::WriteAllText($path, $prefix + $tail, $utf8)
Write-Output "upgrade-sync test tail fixed."
