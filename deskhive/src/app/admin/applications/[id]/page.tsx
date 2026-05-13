import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/status-badge';
import { getApplicationWithUsers } from '@/db/queries/applications';
import type { ApplicationStatus } from '@/db/schema';
import { ReviewActions } from './review-actions';

// Same UUID regex used elsewhere in Phase 1 (cancelBookingAction).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Story 7-4: admin applications detail page. Auth + SUPER_ADMIN guard
// from admin/layout.tsx. Read-only fields + status section + (if REJECTED)
// rejection reason + conditional action area (<ReviewActions> when
// PENDING, banner otherwise).
export default async function AdminApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const result = await getApplicationWithUsers(id);
  if (!result) notFound();

  const { application, applicant, reviewer } = result;
  const status = application.status as ApplicationStatus;

  const submittedAt = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(application.createdAt);

  const reviewedAt = application.reviewedAt
    ? new Intl.DateTimeFormat('en-US', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(application.reviewedAt)
    : null;

  return (
    <main className="container-content admin-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/admin/spaces">Admin</Link>
        <span className="sep">/</span>
        <Link href="/admin/applications">Applications</Link>
        <span className="sep">/</span>
        <span style={{ color: 'var(--color-neutral-700)' }}>
          {applicant.fullName}
        </span>
      </nav>

      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">{applicant.fullName}</h1>
          <p className="sub muted">{applicant.email}</p>
        </div>
        <div style={{ alignSelf: 'center' }}>
          <StatusBadge status={status} size="lg" />
        </div>
      </div>

      <section
        aria-labelledby="sec-application-details"
        className="mb-8"
        style={{ marginTop: '2rem' }}
      >
        <h2 id="sec-application-details" className="h2 mb-4">
          Application details
        </h2>
        <dl style={{ display: 'grid', gap: '0.875rem' }}>
          <DetailRow label="Submitted" value={submittedAt} />
          <DetailRow label="Full name" value={applicant.fullName} />
          <DetailRow label="Email" value={applicant.email} />
          <DetailRow label="Business name" value={application.businessName} />
          <DetailRow
            label="Business address"
            value={application.businessAddress}
            multiline
          />
          <DetailRow label="Tax ID" value={application.taxId} />
          <DetailRow
            label="Motivation"
            value={application.motivation ?? '—'}
            multiline={Boolean(application.motivation)}
          />
        </dl>
      </section>

      {status !== 'PENDING' && reviewedAt && (
        <section
          aria-labelledby="sec-review-meta"
          className="mb-8"
          style={{
            padding: '1rem 1.25rem',
            background: 'var(--color-neutral-50)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <h2 id="sec-review-meta" className="h2 mb-2">
            Review
          </h2>
          <p style={{ fontSize: '14px', margin: 0 }}>
            <span className="muted">Reviewed on</span>{' '}
            <span className="muted-strong">{reviewedAt}</span>
            {reviewer && (
              <>
                {' '}
                <span className="muted">by</span>{' '}
                <span className="muted-strong">{reviewer.email}</span>
              </>
            )}
          </p>
          {status === 'REJECTED' && (
            <div style={{ marginTop: '0.875rem' }}>
              <p
                className="field-label"
                style={{ marginBottom: '0.25rem' }}
              >
                Rejection reason
              </p>
              <p
                className="muted-strong"
                style={{
                  fontSize: '14px',
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                }}
              >
                {application.rejectionReason ?? '—'}
              </p>
            </div>
          )}
        </section>
      )}

      {status === 'PENDING' ? (
        <ReviewActions
          applicationId={application.id}
          applicantName={applicant.fullName}
        />
      ) : (
        <p
          className="muted"
          style={{ fontSize: '14px', marginTop: '2rem' }}
          role="status"
        >
          This application has been{' '}
          {status === 'APPROVED' ? 'approved' : 'rejected'}. Decisions are
          final.
        </p>
      )}
    </main>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd
        className="muted-strong"
        style={{
          fontSize: '14px',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
          margin: 0,
        }}
      >
        {value}
      </dd>
    </div>
  );
}
