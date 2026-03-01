# Audit Automation

To avoid documentation drift and ensure the project remains auditable, the
following automation helpers are recommended.  These can run as `npm run
audit` or be wired into CI.

```bash
# sample entry in package.json scripts
"audit": "node scripts/audit.js"
```

## Suggested checks

1. **TODO/FIXME scan**
   - Walk the `api/` and `src/` folders looking for `TODO` or `FIXME` comments.
   - Output file paths and line numbers; return non-zero exit code if any found.
   - Helps catch unfinished work before merge.

2. **Endpoint documentation consistency**
   - Parse all `requireCapabilities` invocations in `api/routes/**/*.js`.
   - Compare the capability names against `docs/architecture/API_OVERVIEW.md` or
     a dedicated `STREAM_API.md`/`CHAT_API.md` table.
   - Warn on any missing entries.

3. **Upload route validation**
   - Ensure `api/index.js` still mounts `/api/upload` and that `uploadsDir` exists.
   - Optionally, perform a dry run HTTP request against a dev server.

4. **Tracker item summary**
   - Read `docs/architecture/PIVOT_TRACKER.md` and count unchecked tasks
     (lines starting with `- [ ]`).  Fail if too many remain or create a report.

5. **Test coverage gap indicator**
   - Verify that any new route added since the last commit has at least one
     supertest call in `tests/e2e`.  This can be a simple grep for the path string.

6. **Style & lint enforcement**
   - Optionally run ESLint/Prettier to catch syntax errors early.

## Example audit script outline (Node.js)

```js
const fs = require('fs');
const path = require('path');

function scanTodos(dir) {
  // recursively search for TODO/FIXME
}

function extractCapabilities(dir) {
  // regex parse requireCapabilities\("([^)]+)"\)
}

function readTracker() {
  const text = fs.readFileSync('docs/architecture/PIVOT_TRACKER.md','utf8');
  const open = (text.match(/- \[ \]/g) || []).length;
  return open;
}

(async () => {
  const todos = scanTodos('api');
  if (todos.length) {
    console.error('Found TODOs:', todos);
    process.exitCode = 1;
  }
  const openTasks = readTracker();
  console.log('Open tracker tasks:', openTasks);
  // other checks...
})();
```

## Integration with CI

- Add a workflow step in GitHub Actions that runs `npm run audit` on pull
  requests.  If it exits non-zero, the check fails and reviewers must address
  the issues before merging.
- Optionally produce a markdown report and post it as a PR comment using
  [`actions/github-script`](https://github.com/actions/github-script).

## Maintainability

- Keep the audit script lightweight and readable; do not let it become a
  complex linter.
- Periodically revisit the checks; they should evolve with the codebase.
- Document any manual steps in this file so new contributors can replicate.
