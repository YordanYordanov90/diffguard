const confirmed = process.argv.includes("--confirm") && process.env.DIFFGUARD_EVAL_LIVE === "1";
if (!confirmed) {
  console.error("Live evaluation refused: pass --confirm and set DIFFGUARD_EVAL_LIVE=1.");
  process.exit(2);
}

if (!process.env.DIFFGUARD_EVAL_ADAPTER) {
  console.error(
    "Live evaluation requires a developer-supplied sanitized-fixture adapter via DIFFGUARD_EVAL_ADAPTER.",
  );
  process.exit(2);
}

console.error(
  "No live adapter is bundled. Keep live evaluation isolated from production mutation endpoints and review its recorded output with npm run eval:recorded.",
);
process.exit(2);
