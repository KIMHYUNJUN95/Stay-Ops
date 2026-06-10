# User Roles

## Role Model

StayOps should use role-based permissions from the beginning.

Roles are split into:

- Platform-level role
- Organization-level roles

Platform-level roles are stored separately from organization memberships.

Implementation note:

- Initial role constants and labels are implemented in `src/config/roles.ts`.
- These constants are UI/routing helpers only. Final security must still be enforced through server code and Supabase RLS.

## Platform-Level Role

### Developer / Super Admin

Used by the developer/operator of StayOps.

Can:

- Access all organizations for debugging and support
- Manage global settings
- Inspect system-level issues
- Manage technical configuration
- Bypass normal organization limits when needed

Important:

- This role should be limited to trusted developer/operator accounts.
- Actions should be audit logged.
- This role should be stored in a platform-level table, not as a normal organization role.

## Organization-Level Roles

### Owner

The company representative or business owner.

Can:

- Manage organization settings
- Manage all staff
- View all records
- Configure permissions
- Access admin web
- Use mobile operational workflows when needed
- View reports
- Manage subscription/billing later

Implementation note:

- `owner` is treated as a hybrid operations role in the app, which means owners can move between admin web and selected mobile field workflows without needing a separate staff account.

### Office Admin

Office or back-office manager.

Can:

- Use admin web
- View operational records
- Create and manage announcements
- Manage staff invitations
- Assign or update tasks
- Manage inventory and order requests
- View calendar and reservation data
- Search and filter records

### CS Staff

Customer support staff who receive guest communication and update guest-related operational information.

Can:

- View guest information
- View all rooms/properties needed for guest support
- View reservation and stay schedule data
- Manually update early check-out information
- Add guest-related operational notes
- Create tasks related to guest requests
- Update relevant calendar/schedule details
- Create announcements
- Approve, reject, and mark as ordered (주문 처리) for order/supply requests

### Field Manager

On-site manager responsible for field operations.

Can:

- Use mobile app
- View field tasks
- Manage maintenance-related work
- Register and update maintenance issues
- Register and update lost items
- Review cleaning execution records
- Create order/supply requests
- Comment on operational records
- Create announcements

Cannot:

- Approve, reject, or mark as ordered for order/supply requests (office-level action only)

Maintenance responsibility belongs under this role for the first version.

### Staff

Regular employee.

Can:

- Use mobile app
- View guest/reservation information except price/revenue data
- View all rooms/properties needed for work
- Register lost items
- Register maintenance issues
- Start and complete cleaning records
- Create order/supply requests
- Read announcements
- Comment on permitted records

### Part-Time Staff

Part-time worker.

Can:

- Use mobile app
- Register lost items
- Register maintenance issues
- Start and complete cleaning records
- Create order/supply requests if permitted
- Read announcements
- Comment on announcements if permitted

Permissions may be more limited than regular staff depending on company policy, but guest and room/property visibility is required for work.

Part-time staff should not see:

- Price
- Revenue
- Payment amount
- Financial performance data

## Post-MVP Feature Batch Permissions (confirmed 2026-06-09)

These supplement the role definitions above for the approved feature batch. See `docs/planning/01-decision-log.md` (2026-06-09).

- **Internal Board:** all active roles **including Part-Time Staff** can create and read posts. Authors edit/delete their own; admin-capable roles (owner, office_admin, cs_staff, field_manager, developer_super_admin) moderate all (pin/archive/delete). This is intentionally looser than Announcements, where Part-Time Staff cannot create.
- **Staff Suggestions:** any active member can submit and read their own. `public_team` suggestions are readable by everyone; `employee_only` suggestions are readable by the author plus Owner, Office Admin, CS Staff, Field Manager, Staff, and Developer/Super Admin — **not** other Part-Time Staff. Status changes and responses are limited to Owner, Office Admin, CS Staff.
- **Linen Defect:** all active members create/read all linen return records in the organization. Authors can edit/delete their own records; admin-capable roles can edit/delete all records and manage the linen item master.
- **Personal Todo:** tasks are private to the owner by default; assignees and explicit share recipients gain visibility. Part-Time Staff see tasks assigned to them plus tasks linked to rooms/properties they can access.
- **Attendance / Payroll:** workers clock in/out and read their own attendance; admin roles (Owner, Office Admin, CS Staff; possibly Field Manager for review) see org-wide. Wage figures follow the existing rule — Part-Time Staff must not see others' pay/rate data. Payroll-specific roles are deferred with payroll calculation.

## Permission Questions

TBD:

- Should front desk users see all lost items?
- Should housekeeping see all room maintenance requests or only assigned ones?
- Should order requests require approval?
- Who can delete records?
- Should deletion be disabled and replaced with archive?
- Should part-time staff create order requests directly?
- Should Staff and Part-Time Staff have different access by property?
- Which roles can see price/revenue information?
