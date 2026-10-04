#!/usr/bin/env node
/**
 * PreToolUse guard — blocks native Grep/Glob so Claude sessions use lean-ctx
 * (`ctx_search` / `ctx_glob` / `ctx_read`), per the mandatory-tooling rule.
 * Exit 2 + stderr = the tool call is denied and the message is fed back to Claude.
 * Native `Read` is intentionally NOT blocked (the Edit gate needs it).
 * Copied from piatto-pro-erp-angular-app. Wired from .claude/settings.json.
 */
const tool = process.argv[2] || 'that tool';
const alt = tool === 'Grep' ? 'ctx_search' : tool === 'Glob' ? 'ctx_glob' : 'the ctx_* equivalent';
process.stderr.write(
  `lean-ctx: use ${alt} instead of native ${tool} (mandatory-tooling rule). ` +
  `Native Read is allowed only for the edit gate.`,
);
process.exit(2);
