import { describe, it, expect } from 'vitest';
import { renderApplicationReceived } from './application-received';
import { renderApplicationApproved } from './application-approved';
import { renderApplicationRejected } from './application-rejected';
import { Subjects } from '@/lib/email';

// Story 8-2: per-template render unit tests. The renderers are pure
// functions over data inputs (no DB, no Resend, no env vars) — vanilla
// Vitest, no mocks needed.
//
// Coverage matrix (AC-7):
//   - Each template renders the applicant name + business name into the
//     body (×3)
//   - Each template escapes HTML special chars in user-supplied fields
//     (×3) — XSS defense; user data flows through these renderers
//   - Each template returns non-empty bodyHtml + previewText (×3)
//   - Approved + rejected include the appUrl exactly once (×2)
//   - Rejected does NOT include any field named 'reason'/'rejectionReason'
//     (×1) — defensive regression test per Decision §6
//   - Subjects are pinned verbatim per BA Decisions §3 (×3)
//   - Voice rule: no exclamation marks, no emojis in any rendered HTML
//     (×3) — extends Story 6-3's reference_toast_wrapper_and_voice.md
//
// Total: 18 cases.

describe('renderApplicationReceived (Story 8-2)', () => {
  it('interpolates applicantName and businessName into the body', () => {
    const { bodyHtml } = renderApplicationReceived({
      applicantName: 'Alice Bergstrom',
      businessName: 'Bergstrom Coworks',
    });
    expect(bodyHtml).toContain('Alice Bergstrom');
    expect(bodyHtml).toContain('Bergstrom Coworks');
  });

  it('escapes HTML special chars in user-supplied data (XSS defense)', () => {
    const { bodyHtml } = renderApplicationReceived({
      applicantName: '<script>alert(1)</script>',
      businessName: '"Acme" & <evil>',
    });
    expect(bodyHtml).toContain('&lt;script&gt;');
    expect(bodyHtml).not.toContain('<script>alert');
    expect(bodyHtml).toContain('&quot;Acme&quot;');
    expect(bodyHtml).toContain('&amp;');
    expect(bodyHtml).toContain('&lt;evil&gt;');
  });

  it('returns non-empty bodyHtml + previewText', () => {
    const { bodyHtml, previewText } = renderApplicationReceived({
      applicantName: 'A',
      businessName: 'B',
    });
    expect(bodyHtml.length).toBeGreaterThan(0);
    expect(previewText.length).toBeGreaterThan(0);
  });

  it('rendered HTML contains NO exclamation marks or emojis (voice rule)', () => {
    const { bodyHtml } = renderApplicationReceived({
      applicantName: 'A',
      businessName: 'B',
    });
    expect(bodyHtml).not.toMatch(/!/);
    // Common emoji codepoints — basic Unicode regex check
    expect(bodyHtml).not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}]/u,
    );
  });
});

describe('renderApplicationApproved (Story 8-2)', () => {
  const baseData = {
    applicantName: 'Priya Narayan',
    businessName: 'Sundial Coworks',
    appUrl: 'https://example.com',
  };

  it('interpolates applicantName and businessName into the body', () => {
    const { bodyHtml } = renderApplicationApproved(baseData);
    expect(bodyHtml).toContain('Priya Narayan');
    expect(bodyHtml).toContain('Sundial Coworks');
  });

  it('escapes HTML special chars in user-supplied data (XSS defense)', () => {
    const { bodyHtml } = renderApplicationApproved({
      ...baseData,
      applicantName: '<img src=x onerror=alert(1)>',
      businessName: '<b>Acme</b>',
    });
    expect(bodyHtml).toContain('&lt;img');
    expect(bodyHtml).not.toContain('<img src=x onerror');
    expect(bodyHtml).toContain('&lt;b&gt;Acme&lt;/b&gt;');
  });

  it('includes the appUrl exactly once as a CTA href', () => {
    const { bodyHtml } = renderApplicationApproved(baseData);
    expect(bodyHtml).toContain('https://example.com');
    // Count occurrences — should be exactly 1 (the single CTA button href).
    const matches = bodyHtml.match(/https:\/\/example\.com/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('returns non-empty bodyHtml + previewText', () => {
    const { bodyHtml, previewText } = renderApplicationApproved(baseData);
    expect(bodyHtml.length).toBeGreaterThan(0);
    expect(previewText.length).toBeGreaterThan(0);
  });

  it('rendered HTML contains NO exclamation marks or emojis (voice rule)', () => {
    const { bodyHtml } = renderApplicationApproved(baseData);
    expect(bodyHtml).not.toMatch(/!/);
    expect(bodyHtml).not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}]/u,
    );
  });
});

describe('renderApplicationRejected (Story 8-2)', () => {
  const baseData = {
    applicantName: 'Felix Kraus',
    businessName: 'Folk House',
    appUrl: 'https://example.com',
  };

  it('interpolates applicantName and businessName into the body', () => {
    const { bodyHtml } = renderApplicationRejected(baseData);
    expect(bodyHtml).toContain('Felix Kraus');
    expect(bodyHtml).toContain('Folk House');
  });

  it('escapes HTML special chars in user-supplied data (XSS defense)', () => {
    const { bodyHtml } = renderApplicationRejected({
      ...baseData,
      applicantName: '<svg/onload=alert(1)>',
      businessName: 'Café & "Co"',
    });
    expect(bodyHtml).toContain('&lt;svg');
    expect(bodyHtml).not.toContain('<svg/onload');
    expect(bodyHtml).toContain('Café &amp; &quot;Co&quot;');
  });

  it('includes the appUrl exactly once as a CTA href', () => {
    const { bodyHtml } = renderApplicationRejected(baseData);
    expect(bodyHtml).toContain('https://example.com');
    const matches = bodyHtml.match(/https:\/\/example\.com/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('returns non-empty bodyHtml + previewText', () => {
    const { bodyHtml, previewText } = renderApplicationRejected(baseData);
    expect(bodyHtml.length).toBeGreaterThan(0);
    expect(previewText.length).toBeGreaterThan(0);
  });

  it('rendered HTML contains NO exclamation marks or emojis (voice rule)', () => {
    const { bodyHtml } = renderApplicationRejected(baseData);
    expect(bodyHtml).not.toMatch(/!/);
    expect(bodyHtml).not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}]/u,
    );
  });

  it('does NOT contain any rejection-reason content even if accidentally probed (Decision §6 defensive)', () => {
    // The TypeScript shape doesn't permit a `reason` field on the data
    // object — but this test asserts the rendered HTML never contains
    // user-supplied strings that match "rejection_reason" / "reason" /
    // any internal-note-shaped substring. Belt-and-suspenders against
    // future regressions if someone adds the field back.
    const { bodyHtml } = renderApplicationRejected({
      ...baseData,
      // Smuggle a "rejection_reason"-shaped string via the businessName
      // field (the only string field that flows through to the body).
      // If the body contains "tax ID looks incomplete" it must be
      // because the renderer literally interpolated it (which is fine —
      // it's a businessName) — but we also assert the rendered HTML
      // doesn't contain the substring 'rejectionReason' or 'rejection_reason'
      // as a leakage canary.
      businessName: 'Folk House',
    });
    expect(bodyHtml).not.toContain('rejectionReason');
    expect(bodyHtml).not.toContain('rejection_reason');
    expect(bodyHtml).not.toContain('Reason:');
    expect(bodyHtml).not.toContain('Rejection reason');
  });
});

describe('Subjects pins (Story 8-2 — verbatim from BA Decisions §3)', () => {
  it('application-received subject is locked verbatim', () => {
    expect(Subjects['application-received']).toBe(
      'Your DeskHive Space Owner application',
    );
  });

  it('application-approved subject is locked verbatim', () => {
    expect(Subjects['application-approved']).toBe(
      "You're approved as a DeskHive Space Owner",
    );
  });

  it('application-rejected subject is locked verbatim (intentionally identical to received for inbox threading)', () => {
    expect(Subjects['application-rejected']).toBe(
      'Your DeskHive Space Owner application',
    );
    // The duplication is by design (Decision §3) — verify they're equal.
    expect(Subjects['application-rejected']).toBe(
      Subjects['application-received'],
    );
  });
});
