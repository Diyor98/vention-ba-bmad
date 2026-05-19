import { listAllUsers } from '@/db/queries/users';
import { AdminUsersTable } from './users-table';

/**
 * DESIGN-INT-15 — Admin users scaffold (Phase 3 wiring deferred).
 *
 * Read-only directory of all users in the system. Filter chips by role
 * (All / Guest / Host / Admin) drive an in-memory filter; a search
 * input filters by name+email. Phase 3 will wire destructive admin
 * actions (role change / suspend / delete / password reset) — for now
 * the "Manage" affordance is disabled with a Phase 3 tooltip.
 *
 * Auth: admin/layout.tsx already enforces SUPER_ADMIN (Phase 1 pattern).
 */
export default async function AdminUsersPage() {
  const rows = await listAllUsers();

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Users</h1>
          <p className="sub muted">
            {rows.length} total · {rows.filter((u) => u.role === 'SPACE_OWNER').length}{' '}
            owners · {rows.filter((u) => u.role === 'GUEST').length} guests
          </p>
        </div>
      </div>

      <AdminUsersTable rows={rows} />
    </main>
  );
}
