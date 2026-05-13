import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sonner before importing the wrapper. The wrapper imports `toast`
// from 'sonner' at module-load time; the mock must be in place first.
vi.mock('sonner', () => {
  const success = vi.fn();
  const error = vi.fn();
  return {
    toast: { success, error },
  };
});

import { toast } from 'sonner';
import { toastSuccess, toastError, TOAST_COPY } from './toast';

const sonnerToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  sonnerToast.success.mockClear();
  sonnerToast.error.mockClear();
});

describe('toastSuccess', () => {
  it('is exported as a function', () => {
    expect(typeof toastSuccess).toBe('function');
  });

  it('forwards the title to sonner toast.success', () => {
    toastSuccess('Hello');
    expect(sonnerToast.success).toHaveBeenCalledTimes(1);
    expect(sonnerToast.success).toHaveBeenCalledWith(
      'Hello',
      expect.objectContaining({ className: 'toast-success' }),
    );
  });

  it('forwards description to sonner', () => {
    toastSuccess('Hello', { description: 'World' });
    expect(sonnerToast.success).toHaveBeenCalledWith(
      'Hello',
      expect.objectContaining({ description: 'World' }),
    );
  });

  it('forwards the action prop (label + onClick) to sonner', () => {
    const onClick = vi.fn();
    toastSuccess('Hello', { action: { label: 'Click me', onClick } });
    expect(sonnerToast.success).toHaveBeenCalledWith(
      'Hello',
      expect.objectContaining({
        action: { label: 'Click me', onClick },
      }),
    );
  });

  it('applies the .toast-success className for brand-token styling', () => {
    toastSuccess('Test');
    const callArgs = sonnerToast.success.mock.calls[0]?.[1] as {
      className?: string;
    };
    expect(callArgs.className).toBe('toast-success');
  });
});

describe('toastError', () => {
  it('is exported as a function', () => {
    expect(typeof toastError).toBe('function');
  });

  it('forwards the title to sonner toast.error', () => {
    toastError('Booking failed');
    expect(sonnerToast.error).toHaveBeenCalledTimes(1);
    expect(sonnerToast.error).toHaveBeenCalledWith(
      'Booking failed',
      expect.objectContaining({ className: 'toast-error' }),
    );
  });

  it('forwards description (optional second arg) to sonner', () => {
    toastError('Booking failed', 'Something went wrong.');
    expect(sonnerToast.error).toHaveBeenCalledWith(
      'Booking failed',
      expect.objectContaining({ description: 'Something went wrong.' }),
    );
  });

  it('applies the .toast-error className for brand-token styling', () => {
    toastError('Test');
    const callArgs = sonnerToast.error.mock.calls[0]?.[1] as {
      className?: string;
    };
    expect(callArgs.className).toBe('toast-error');
  });
});

describe('TOAST_COPY', () => {
  // These are BA-locked verbatim strings from Decisions §4 + §5. The tests
  // here pin them so any drift fails CI and the BA gets a chance to weigh in
  // before it ships.
  it('has the verbatim success title from BA Decisions §4', () => {
    expect(TOAST_COPY.BOOKING_SUCCESS_TITLE).toBe('Booking requested');
  });

  it('has the verbatim success description from BA Decisions §4', () => {
    expect(TOAST_COPY.BOOKING_SUCCESS_DESCRIPTION).toBe(
      "We'll let you know when it's confirmed.",
    );
  });

  it('has the verbatim success action label from BA Decisions §4', () => {
    expect(TOAST_COPY.BOOKING_SUCCESS_ACTION_LABEL).toBe(
      'View in My Bookings',
    );
  });

  it('has the verbatim error title from BA Decisions §5', () => {
    expect(TOAST_COPY.BOOKING_FAILED_TITLE).toBe('Booking failed');
  });

  it('has the past-date error toast description with trailing period (BA tweak)', () => {
    // BA explicitly approved adding a trailing period to this toast string
    // for punctuation consistency, even though the Server Action's verbatim
    // US-3.3 message stays without the period.
    expect(TOAST_COPY.BOOKING_FAILED_PAST_DATE).toBe(
      'Booking date cannot be in the past.',
    );
  });

  it('has the verbatim double-booking error from BA Decisions §5', () => {
    expect(TOAST_COPY.BOOKING_FAILED_DOUBLE_BOOKING).toBe(
      'That desk was just booked by someone else. Please try a different desk.',
    );
  });

  it('has the desk-not-found error toast string', () => {
    expect(TOAST_COPY.BOOKING_FAILED_DESK_NOT_FOUND).toBe(
      'This desk is not available.',
    );
  });

  it('has the generic error fallback from BA Decisions §5', () => {
    expect(TOAST_COPY.BOOKING_FAILED_GENERIC).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('has the cancel success copy from BA Decisions §10', () => {
    expect(TOAST_COPY.CANCEL_SUCCESS).toBe('Booking cancelled.');
  });

  it('has the verbatim application-submitted title from Story 7-3 BA Decisions §8', () => {
    expect(TOAST_COPY.APPLICATION_SUBMITTED_TITLE).toBe('Application submitted');
  });

  it('has the verbatim application-submitted description from Story 7-3 BA Decisions §8', () => {
    expect(TOAST_COPY.APPLICATION_SUBMITTED_DESCRIPTION).toBe(
      "We'll email you when it's reviewed.",
    );
  });

  it('has the verbatim application-approved title from Story 7-4 BA Decisions §6', () => {
    expect(TOAST_COPY.APPLICATION_APPROVED_TITLE).toBe('Application approved');
  });

  it('has the verbatim application-rejected title from Story 7-4 BA Decisions §6 (period included)', () => {
    expect(TOAST_COPY.APPLICATION_REJECTED_TITLE).toBe('Application rejected.');
  });
});
