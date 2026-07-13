$ErrorActionPreference = "Stop"

$path = "C:\Users\adahn\Downloads\ai blue project\Project Blue App\desktop_pet\upgrade-sync.cjs"
$utf8 = [System.Text.UTF8Encoding]::new($false)
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$marker = "async function pullSharedUpgrade(repoRoot, appRoot) {"
$index = $text.IndexOf($marker)
if ($index -lt 0) {
  throw "Could not find pullSharedUpgrade marker."
}
$prefix = $text.Substring(0, $index)
$tail = @'
async function pullSharedUpgrade(repoRoot, appRoot) {
  const before = await fetchSharedSyncStatus(repoRoot, appRoot);
  if (!before.status.clean) {
    throw new Error("Blue will not pull while this PC has uncommitted local edits.");
  }
  if (before.state === "diverged") {
    throw new Error("Both PCs have unique commits. Ask a human to merge before pulling.");
  }
  const backup = await createSharedSyncBackup(appRoot, repoRoot, "pre-pull shared upgrade backup");
  if (before.status.behind === 0) {
    return {
      state: "already-current",
      before,
      after: before,
      backup,
      output: "No roommate upgrades were waiting on origin.",
      restartRequired: false
    };
  }
  const branch = before.status.branch === "unknown" ? "main" : before.status.branch;
  const output = await runGit(repoRoot, ["pull", "--ff-only", "origin", branch], {
    timeoutMs: 120000,
    maxOutputBytes: 2097152
  });
  const after = await readSharedSyncStatus(repoRoot, appRoot);
  return {
    state: "pulled",
    before,
    after,
    backup,
    output,
    restartRequired: true
  };
}

async function publishSharedUpgrade(repoRoot, appRoot) {
  const before = await fetchSharedSyncStatus(repoRoot, appRoot);
  if (!before.status.clean) {
    throw new Error("Blue will not push while this PC has uncommitted local edits.");
  }
  if (before.status.behind > 0) {
    throw new Error("Your roommate has commits you do not have yet. Pull and review first.");
  }
  if (before.status.ahead === 0) {
    return {
      state: "nothing-to-publish",
      before,
      after: before,
      output: "No local commits are waiting to publish.",
      restartRequired: false
    };
  }
  const branch = before.status.branch === "unknown" ? "main" : before.status.branch;
  const output = await runGit(repoRoot, ["push", "origin", branch], {
    timeoutMs: 120000,
    maxOutputBytes: 2097152
  });
  const after = await fetchSharedSyncStatus(repoRoot, appRoot);
  return {
    state: "published",
    before,
    after,
    output,
    restartRequired: false
  };
}

module.exports = {
  SYNC_SCHEMA,
  parseBranchStatus,
  classifySyncState,
  syncAdvice,
  readSharedSyncStatus,
  fetchSharedSyncStatus,
  createSharedSyncBackup,
  pullSharedUpgrade,
  publishSharedUpgrade
};
'@
[System.IO.File]::WriteAllText($path, $prefix + $tail, $utf8)
Write-Output "upgrade-sync tail fixed."
