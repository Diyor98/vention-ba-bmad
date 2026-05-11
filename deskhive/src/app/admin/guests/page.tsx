// Story 5-2: placeholder page. The Guests tab in the admin sub-nav points
// here per the design package. Full guest management is Phase 2 — no
// schema changes, no new queries in this story. Inherits the
// requireSession() + requireRole('SUPER_ADMIN') guard from admin/layout.tsx.
export default function AdminGuestsPage() {
  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Guests</h1>
          <p className="sub muted">
            Guest management coming in Phase 2. For now, guests are managed
            implicitly through their bookings.
          </p>
        </div>
      </div>
    </main>
  );
}
