/**
 * Story 8-2: E2E helper for reading the email recording sink file
 * written by sendEmail when EMAIL_TEST_RECORD_FILE is set. JSONL
 * format (one JSON object per line).
 *
 * Production: this code never runs against real emails — the sink is
 * activated only when EMAIL_TEST_RECORD_FILE is set (which
 * playwright.config.ts sets for E2E runs).
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';

export type EmailRecord = {
  template: string;
  to: string;
  subject: string;
  dataJson: string;
  timestamp: string;
};

/**
 * Reads the recording file and returns one EmailRecord per JSONL line.
 * Returns an empty array if the file is missing (e.g., no emails fired
 * yet) or empty.
 */
export async function readRecordedEmails(
  filePath?: string,
): Promise<EmailRecord[]> {
  const path = (filePath ?? process.env.EMAIL_TEST_RECORD_FILE ?? '').trim();
  if (path.length === 0) {
    throw new Error(
      'readRecordedEmails: no path provided and EMAIL_TEST_RECORD_FILE is unset.',
    );
  }
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  return lines.map((line) => JSON.parse(line) as EmailRecord);
}

/**
 * Truncates the recording file. Used in beforeEach to reset state
 * between tests. Safe to call when the file doesn't exist.
 */
export async function truncateRecordedEmails(filePath?: string): Promise<void> {
  const path = (filePath ?? process.env.EMAIL_TEST_RECORD_FILE ?? '').trim();
  if (path.length === 0) {
    throw new Error(
      'truncateRecordedEmails: no path provided and EMAIL_TEST_RECORD_FILE is unset.',
    );
  }
  await writeFile(path, '', 'utf8');
}

/**
 * Deletes the recording file. Optional cleanup in afterAll (the file
 * can also be left for debugging — its absence is harmless).
 */
export async function deleteRecordedEmailsFile(
  filePath?: string,
): Promise<void> {
  const path = (filePath ?? process.env.EMAIL_TEST_RECORD_FILE ?? '').trim();
  if (path.length === 0) return;
  try {
    await unlink(path);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return;
    }
    throw err;
  }
}
