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
