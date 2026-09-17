import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CRON_DAILY,
  CRON_PUSH_FLUSH,
  PUSH_BATCH_MINUTES,
  PUSH_KIND,
  scheduledJobKind,
  scheduledTasksForCron,
} from '../lib/pushCenter.ts';
import { flushDuePushBatches, ingestPushEvent } from '../worker/pushBatches.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function createMigratedBatchEnv() {
  const rows = new Map();
  const runSql = async (sql, args) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (s.startsWith('CREATE TABLE') || s.startsWith('CREATE INDEX')) {
      throw new Error('schema must come from migration 016, not runtime CREATE TABLE');
    }
    if (s.startsWith('DELETE FROM push_batches WHERE group_key')) {
      const [key, now] = args;
      const row = rows.get(key);
      if (row && (row.flushed_at != null || Number(row.window_ends_at) <= Number(now))) {
        rows.delete(key);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    if (s.startsWith('INSERT INTO push_batches')) {
      const [
        group_key,
        kind,
        recipient_user_id,
        target_id,
        first_actor_id,
        first_actor_name,
        actor_ids,
        subject_names,
        extra,
        first_push_sent,
        first_event_at,
        last_event_at,
        window_ends_at,
      ] = args;
      if (rows.has(group_key)) return { meta: { changes: 0 } };
      rows.set(group_key, {
        group_key,
        kind,
        recipient_user_id,
        target_id,
        first_actor_id,
        first_actor_name,
        actor_ids,
        subject_names,
        extra,
        first_push_sent,
        first_event_at,
        last_event_at,
        window_ends_at,
        flushed_at: null,
      });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('UPDATE push_batches SET actor_ids')) {
      const [actor_ids, subject_names, extra, last_event_at, group_key] = args;
      const row = rows.get(group_key);
      if (!row || row.flushed_at != null) return { meta: { changes: 0 } };
      Object.assign(row, { actor_ids, subject_names, extra, last_event_at });
      return { meta: { changes: 1 } };
    }
    if (s.startsWith('UPDATE push_batches SET flushed_at')) {
      const [flushed_at, group_key] = args;
      const row = rows.get(group_key);
      if (!row || row.flushed_at != null) return { meta: { changes: 0 } };
      row.flushed_at = flushed_at;
      return { meta: { changes: 1 } };
    }
    throw new Error(`unhandled run sql: ${s}`);
  };
  const allSql = async (sql, args) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT * FROM push_batches WHERE group_key')) {
      const row = rows.get(args[0]);
      return { results: row ? [{ ...row }] : [] };
    }
    if (s.startsWith('SELECT * FROM push_batches WHERE flushed_at IS NULL')) {
      const now = Number(args[0]);
      const limit = Number(args[1] ?? 20);
      return {
        results: [...rows.values()]
          .filter((r) => r.flushed_at == null && Number(r.window_ends_at) <= now)
          .sort((a, b) => Number(a.window_ends_at) - Number(b.window_ends_at))
          .slice(0, limit)
          .map((r) => ({ ...r })),
      };
    }
    throw new Error(`unhandled all sql: ${s}`);
  };
  const stmt = (sql) => {
    const exec = (args) => ({
      run: () => runSql(sql, args),
      all: () => allSql(sql, args),
    });
    return {
      bind: (...args) => exec(args),
      run: () => exec([]).run(),
      all: () => exec([]).all(),
    };
  };
  return { env: { DB: { prepare: stmt } } };
}

describe('precheck cron scheduled()', () => {
  it('1. cron */5 solo flushea push_batches', () => {
    assert.equal(scheduledJobKind(CRON_PUSH_FLUSH), 'push_flush');
    assert.deepEqual(scheduledTasksForCron('*/5 * * * *'), ['flushDuePushBatches']);
    const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
    assert.match(wrangler, /"\*\/5 \* \* \* \*"/);
    assert.equal(CRON_PUSH_FLUSH, '*/5 * * * *');
  });

  it('2. cron */5 no corre cumpleaños ni renovación', () => {
    const tasks = scheduledTasksForCron(CRON_PUSH_FLUSH);
    assert.equal(tasks.includes('runPersonalPetBirthdays'), false);
    assert.equal(tasks.includes('runAlertRenewalReminders'), false);
    assert.equal(tasks.includes('processPushReceipts'), false);
    assert.equal(tasks.includes('runReelCleanup'), false);
    assert.equal(tasks.includes('runStoryCleanup'), false);
    const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
    const start = worker.indexOf('async scheduled(event, env)');
    const block = worker.slice(start, worker.indexOf('runStoryCleanup', start) + 80);
    assert.match(block, /scheduledJobKind\(event && event\.cron\) === 'push_flush'/);
    const flushBranch = block.slice(0, block.indexOf('return;'));
    assert.match(flushBranch, /flushDuePushBatches/);
    assert.doesNotMatch(flushBranch, /runPersonalPetBirthdays/);
    assert.doesNotMatch(flushBranch, /runAlertRenewalReminders/);
  });

  it('3. cron diario conserva las tareas diarias', () => {
    assert.equal(scheduledJobKind(CRON_DAILY), 'daily');
    assert.equal(scheduledJobKind(undefined), 'daily');
    assert.deepEqual(scheduledTasksForCron(CRON_DAILY), [
      'runPersonalPetBirthdays',
      'runAlertRenewalReminders',
      'processPushReceipts',
      'flushDuePushBatches',
      'runReelCleanup',
      'runStoryCleanup',
    ]);
    const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
    assert.match(wrangler, /"0 11 \* \* \*"/);
    assert.equal(CRON_DAILY, '0 11 * * *');
  });
});

describe('precheck esquema 016, sin CREATE TABLE runtime', () => {
  it('4–5. ingest/flush usan la tabla ya migrada y no crean esquema', async () => {
    const batches = readFileSync(join(root, 'worker/pushBatches.js'), 'utf8');
    const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');
    assert.doesNotMatch(batches, /CREATE TABLE/);
    assert.doesNotMatch(batches, /ensurePushBatchSchema/);
    assert.doesNotMatch(worker, /CREATE TABLE IF NOT EXISTS push_batches/);
    assert.match(batches, /INSERT INTO push_batches/);

    const { env } = createMigratedBatchEnv();
    const sent = [];
    const notifyUserPush = async (_env, input) => {
      sent.push(input.buildMessage('ExponentPushToken[test]'));
      return { sent: 1 };
    };
    const now = 20_000_000;
    const first = await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.LIKE,
      actorId: 'maria',
      actorName: 'María',
      recipientId: 'owner',
      targetId: 'post-1',
      now,
    });
    assert.equal(first.action, 'enqueue');
    await ingestPushEvent(env, notifyUserPush, {
      kind: PUSH_KIND.LIKE,
      actorId: 'lucas',
      actorName: 'Lucas',
      recipientId: 'owner',
      targetId: 'post-1',
      now,
    });
    await flushDuePushBatches(env, notifyUserPush, now + PUSH_BATCH_MINUTES.SOCIAL * 60_000);
    assert.equal(sent.length, 1);
    assert.match(sent[0].title, /María y 1 persona más/);
  });
});
