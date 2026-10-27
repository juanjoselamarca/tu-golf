#!/usr/bin/env node
/**
 * The checks that gate a push (CLAUDE.md, rule 1): typecheck, tests, build from a clean .next and the DB schema
 * check. When they pass it records the tree they ran on, and the pre-push hook skips them if every pushed commit
 * has exactly that tree, instead of repeating them right after `npm run verify`.
 *
 * Usage:  npm run verify                      (before committing)
 *         node scripts/verify.mjs --pre-push   (scripts/git-hooks/pre-push, with the pushed refs on stdin)
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mensajePushNoHead, pushesQueNoSonHead } from './lib/push-solo-head.mjs'

const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts }).trim()
const VERIFIED_TREE = git(['rev-parse', '--git-path', 'verified-tree'])

/** Tree of the working copy as it is, untracked files included, without touching the real index. */
function workingTree() {
  const dir = mkdtempSync(path.join(tmpdir(), 'verify-'))
  const index = path.join(dir, 'index')
  try {
    copyFileSync(git(['rev-parse', '--git-path', 'index']), index)
    const env = { ...process.env, GIT_INDEX_FILE: index }
    git(['add', '-A'], { env })
    return git(['write-tree'], { env })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function run(label, command, okStatuses = [0]) {
  console.log(`verify: ${label}`)
  const { status } = spawnSync(command, { shell: true, stdio: 'inherit' })
  if (!okStatuses.includes(status)) process.exit(status || 1)
}

if (process.argv.includes('--pre-push')) {
  let verified = ''
  try {
    verified = readFileSync(VERIFIED_TREE, 'utf8').trim()
  } catch {}
  // Each stdin line: <local ref> <local sha> <remote ref> <remote sha>; an all-zero local sha deletes a branch.
  const stdin = readFileSync(0, 'utf8')
  // The checks below run on the checkout: a branch pushed from elsewhere (not HEAD) would go unchecked.
  const noHead = pushesQueNoSonHead(stdin, git(['rev-parse', 'HEAD']))
  if (noHead.length > 0) {
    console.error(mensajePushNoHead(noHead))
    process.exit(1)
  }
  const pushed = stdin.split('\n').map(line => line.split(' ')[1]).filter(sha => /[^0]/.test(sha ?? '0'))
  if (verified && pushed.every(sha => git(['rev-parse', `${sha}^{tree}`]) === verified)) {
    console.log('pre-push: these commits are the tree npm run verify already passed, skipping the checks')
    process.exit(0)
  }
}

const tree = workingTree()
run('tsc', 'npx tsc --noEmit')
run('tests', 'npm run test')
rmSync('.next', { recursive: true, force: true })
run('build', 'npm run build')
// Exit 2 = no credentials or no network: warns, does not block.
run('schema', 'node --env-file-if-exists=.env.local scripts/verify-db-schema.mjs', [0, 2])
if (workingTree() === tree) writeFileSync(VERIFIED_TREE, `${tree}\n`)
