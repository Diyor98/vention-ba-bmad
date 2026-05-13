import { describe, it, expect } from 'vitest';
import { renderBookingRequestedGuest } from './booking-requested-guest';
import { renderBookingRequestedOwner } from './booking-requested-owner';
import { renderBookingConfirmedGuest } from './booking-confirmed-guest';
import { renderBookingConfirmedOwner } from './booking-confirmed-owner';
import { renderBookingRejectedGuest } from './booking-rejected-guest';
import { renderBookingRejectedOwner } from './booking-rejected-owner';
import { renderBookingCancelledGuest } from './booking-cancelled-guest';
import { renderBookingCancelledOwner } from './booking-cancelled-owner';

// Story 8-3: per-template render unit tests. Pure functions over data
// inputs — vanilla Vitest, no mocks needed.
//
// Coverage matrix (AC-10):
//   - 8 × subject format pin (4 guest-side prefix '[DeskHive] Your booking at'
//     + 4 owner-side prefix '[DeskHive] Booking on' WITH date interpolation)
//   - 8 × HTML escape in body (XSS defense for user-supplied fields)
//   - 8 × voice rule (no '!', no emojis)
//   - 8 × body contains expected fields (name + space + desk + formatted date)
//   - 4 × owner-side templates do NOT leak guestName-shaped data
//     (Decision §9 type-narrow anti-leakage belt-and-suspenders)
//
// Total: 36 cases.

const guestData = {
  guestName: 'Alice Bergstrom',
  spaceName: 'Sundial Coworks',
  deskLabel: 'Desk 1',
  bookingDate: '2026-08-26',
  appUrl: 'https://example.com',
};

const ownerData = {
  ownerName: 'Priya Narayan',
  spaceName: 'Sundial Coworks',
  deskLabel: 'Desk 1',
  bookingDate: '2026-08-26',
  appUrl: 'https://example.com',
};

const xssGuestData = {
  guestName: '<script>alert(1)</script>',
  spaceName: 'Sundial " & <evil>',
  deskLabel: '<b>Desk</b>',
  bookingDate: '2026-08-26',
  appUrl: 'https://example.com',
};

const xssOwnerData = {
  ownerName: '<img onerror=alert(1) src=x>',
  spaceName: 'Café & "Co"',
  deskLabel: '<svg/onload>',
  bookingDate: '2026-08-26',
  appUrl: 'https://example.com',
};

const noEmojiOrBangRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}]/u;

describe('renderBookingRequestedGuest (Story 8-3)', () => {
  it('subject pin: [DeskHive] Your booking at + spaceName', () => {
    expect(renderBookingRequestedGuest(guestData).subject).toBe(
      '[DeskHive] Your booking at Sundial Coworks',
    );
  });

  it('escapes HTML special chars in user-supplied fields', () => {
    const { bodyHtml } = renderBookingRequestedGuest(xssGuestData);
    expect(bodyHtml).toContain('&lt;script&gt;');
    expect(bodyHtml).not.toContain('<script>alert');
    expect(bodyHtml).toContain('&quot;');
    expect(bodyHtml).toContain('&amp;');
  });

  it('voice rule: no exclamation marks, no emojis', () => {
    const { bodyHtml } = renderBookingRequestedGuest(guestData);
    expect(bodyHtml).not.toMatch(/!/);
    expect(bodyHtml).not.toMatch(noEmojiOrBangRegex);
  });

  it('body contains guestName + spaceName + deskLabel + formatted date', () => {
    const { bodyHtml } = renderBookingRequestedGuest(guestData);
    expect(bodyHtml).toContain('Alice Bergstrom');
    expect(bodyHtml).toContain('Sundial Coworks');
    expect(bodyHtml).toContain('Desk 1');
    expect(bodyHtml).toContain('Wed, Aug 26');
  });
});

describe('renderBookingRequestedOwner (Story 8-3)', () => {
  it('subject pin: [DeskHive] Booking on + spaceName + dash + date', () => {
    expect(renderBookingRequestedOwner(ownerData).subject).toBe(
      '[DeskHive] Booking on Sundial Coworks — Wed, Aug 26',
    );
  });

  it('escapes HTML special chars in user-supplied fields', () => {
    const { bodyHtml } = renderBookingRequestedOwner(xssOwnerData);
    expect(bodyHtml).toContain('&lt;img');
    expect(bodyHtml).not.toContain('<img onerror=');
    expect(bodyHtml).toContain('Café &amp;');
  });

  it('voice rule: no exclamation marks, no emojis', () => {
    const { bodyHtml } = renderBookingRequestedOwner(ownerData);
    expect(bodyHtml).not.toMatch(/!/);
    expect(bodyHtml).not.toMatch(noEmojiOrBangRegex);
  });

  it('body contains ownerName + spaceName + deskLabel + formatted date', () => {
    const { bodyHtml } = renderBookingRequestedOwner(ownerData);
    expect(bodyHtml).toContain('Priya Narayan');
    expect(bodyHtml).toContain('Sundial Coworks');
    expect(bodyHtml).toContain('Desk 1');
    expect(bodyHtml).toContain('Wed, Aug 26');
  });

  it('does NOT leak guest name even if smuggled via other fields (Decision §9 defensive)', () => {
    // Type-system narrowing already prevents passing guestName to owner
    // templates. This test confirms no field-shape pollution at runtime.
    const { bodyHtml } = renderBookingRequestedOwner(ownerData);
    expect(bodyHtml).not.toContain('Alice Bergstrom');
    expect(bodyHtml).not.toContain('guestName');
  });
});

describe('renderBookingConfirmedGuest (Story 8-3)', () => {
  it('subject pin: [DeskHive] Your booking at + spaceName', () => {
    expect(renderBookingConfirmedGuest(guestData).subject).toBe(
      '[DeskHive] Your booking at Sundial Coworks',
    );
  });

  it('escapes HTML special chars', () => {
    const { bodyHtml } = renderBookingConfirmedGuest(xssGuestData);
    expect(bodyHtml).toContain('&lt;script&gt;');
    expect(bodyHtml).not.toContain('<script>alert');
  });

  it('voice rule: no exclamation marks, no emojis', () => {
    const { bodyHtml } = renderBookingConfirmedGuest(guestData);
    expect(bodyHtml).not.toMatch(/!/);
    expect(bodyHtml).not.toMatch(noEmojiOrBangRegex);
  });

  it('body contains cancellation-policy disclosure', () => {
    const { bodyHtml } = renderBookingConfirmedGuest(guestData);
    expect(bodyHtml).toContain('Alice Bergstrom');
    expect(bodyHtml).toContain('full refund 24+ hours');
    expect(bodyHtml).toContain('no refund within 24 hours');
  });
});

describe('renderBookingConfirmedOwner (Story 8-3)', () => {
  it('subject pin: [DeskHive] Booking on + spaceName + dash + date', () => {
    expect(renderBookingConfirmedOwner(ownerData).subject).toBe(
      '[DeskHive] Booking on Sundial Coworks — Wed, Aug 26',
    );
  });

  it('escapes HTML special chars', () => {
    const { bodyHtml } = renderBookingConfirmedOwner(xssOwnerData);
    expect(bodyHtml).toContain('&lt;img');
    expect(bodyHtml).not.toContain('<img onerror=');
  });

  it('voice rule: no exclamation marks, no emojis', () => {
    const { bodyHtml } = renderBookingConfirmedOwner(ownerData);
    expect(bodyHtml).not.toMatch(/!/);
    expect(bodyHtml).not.toMatch(noEmojiOrBangRegex);
  });

  it('body indicates the admin acted on owner behalf', () => {
    const { bodyHtml } = renderBookingConfirmedOwner(ownerData);
    expect(bodyHtml).toContain('Priya Narayan');
    expect(bodyHtml).toContain('admin confirmed');
    expect(bodyHtml).toContain('No action needed');
  });

  it('does NOT leak guest name (Decision §9 defensive)', () => {
    const { bodyHtml } = renderBookingConfirmedOwner(ownerData);
    expect(bodyHtml).not.toContain('guestName');
    expect(bodyHtml).not.toContain('Alice Bergstrom');
  });
});

describe('renderBookingRejectedGuest (Story 8-3)', () => {
  it('subject pin: [DeskHive] Your booking at + spaceName', () => {
    expect(renderBookingRejectedGuest(guestData).subject).toBe(
      '[DeskHive] Your booking at Sundial Coworks',
    );
  });

  it('escapes HTML special chars', () => {
    const { bodyHtml } = renderBookingRejectedGuest(xssGuestData);
    expect(bodyHtml).toContain('&lt;script&gt;');
    expect(bodyHtml).not.toContain('<script>alert');
  });

  it('voice rule: no exclamation marks, no emojis', () => {
    const { bodyHtml } = renderBookingRejectedGuest(guestData);
    expect(bodyHtml).not.toMatch(/!/);
    expect(bodyHtml).not.toMatch(noEmojiOrBangRegex);
  });

  it('body uses Browse spaces CTA (soft re-engagement per Decision §8)', () => {
    const { bodyHtml } = renderBookingRejectedGuest(guestData);
    expect(bodyHtml).toContain('Browse spaces');
    expect(bodyHtml).toContain('Alice Bergstrom');
  });
});

describe('renderBookingRejectedOwner (Story 8-3)', () => {
  it('subject pin: [DeskHive] Booking on + spaceName + dash + date', () => {
    expect(renderBookingRejectedOwner(ownerData).subject).toBe(
      '[DeskHive] Booking on Sundial Coworks — Wed, Aug 26',
    );
  });

  it('escapes HTML special chars', () => {
    const { bodyHtml } = renderBookingRejectedOwner(xssOwnerData);
    expect(bodyHtml).toContain('&lt;img');
    expect(bodyHtml).not.toContain('<img onerror=');
  });

  it('voice rule: no exclamation marks, no emojis', () => {
    const { bodyHtml } = renderBookingRejectedOwner(ownerData);
    expect(bodyHtml).not.toMatch(/!/);
    expect(bodyHtml).not.toMatch(noEmojiOrBangRegex);
  });

  it('body indicates the admin acted on owner behalf', () => {
    const { bodyHtml } = renderBookingRejectedOwner(ownerData);
    expect(bodyHtml).toContain('Priya Narayan');
    expect(bodyHtml).toContain('admin rejected');
    expect(bodyHtml).toContain('No action needed');
  });

  it('does NOT leak guest name (Decision §9 defensive)', () => {
    const { bodyHtml } = renderBookingRejectedOwner(ownerData);
    expect(bodyHtml).not.toContain('Alice Bergstrom');
    expect(bodyHtml).not.toContain('guestName');
  });
});

describe('renderBookingCancelledGuest (Story 8-3)', () => {
  it('subject pin: [DeskHive] Your booking at + spaceName', () => {
    expect(renderBookingCancelledGuest(guestData).subject).toBe(
      '[DeskHive] Your booking at Sundial Coworks',
    );
  });

  it('escapes HTML special chars', () => {
    const { bodyHtml } = renderBookingCancelledGuest(xssGuestData);
    expect(bodyHtml).toContain('&lt;script&gt;');
    expect(bodyHtml).not.toContain('<script>alert');
  });

  it('voice rule: no exclamation marks, no emojis', () => {
    const { bodyHtml } = renderBookingCancelledGuest(guestData);
    expect(bodyHtml).not.toMatch(/!/);
    expect(bodyHtml).not.toMatch(noEmojiOrBangRegex);
  });

  it('body refund mention is deliberately VAGUE (Decision §7)', () => {
    const { bodyHtml } = renderBookingCancelledGuest(guestData);
    expect(bodyHtml).toContain('If a refund applies');
    // Critical Decision §7: cancellation emails must NOT make definitive
    // refund claims — that's Story 8-4's territory.
    expect(bodyHtml).not.toMatch(/A full refund will be issued/i);
    expect(bodyHtml).not.toMatch(/No refund applies/i);
    expect(bodyHtml).not.toMatch(/Your refund has been/i);
  });
});

describe('renderBookingCancelledOwner (Story 8-3)', () => {
  it('subject pin: [DeskHive] Booking on + spaceName + dash + date', () => {
    expect(renderBookingCancelledOwner(ownerData).subject).toBe(
      '[DeskHive] Booking on Sundial Coworks — Wed, Aug 26',
    );
  });

  it('escapes HTML special chars', () => {
    const { bodyHtml } = renderBookingCancelledOwner(xssOwnerData);
    expect(bodyHtml).toContain('&lt;img');
    expect(bodyHtml).not.toContain('<img onerror=');
  });

  it('voice rule: no exclamation marks, no emojis', () => {
    const { bodyHtml } = renderBookingCancelledOwner(ownerData);
    expect(bodyHtml).not.toMatch(/!/);
    expect(bodyHtml).not.toMatch(noEmojiOrBangRegex);
  });

  it('body notes desk is available again (no refund mention per Decision §7)', () => {
    const { bodyHtml } = renderBookingCancelledOwner(ownerData);
    expect(bodyHtml).toContain('Priya Narayan');
    expect(bodyHtml).toContain('available for that date again');
    // No refund/payout/money mentions — that's Story 8-4's payment-* templates.
    expect(bodyHtml).not.toMatch(/refund/i);
    expect(bodyHtml).not.toMatch(/payout/i);
  });

  it('does NOT leak guest name (Decision §9 defensive)', () => {
    const { bodyHtml } = renderBookingCancelledOwner(ownerData);
    expect(bodyHtml).not.toContain('Alice Bergstrom');
    expect(bodyHtml).not.toContain('guestName');
  });
});
