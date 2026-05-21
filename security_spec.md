# Security Specification for EpEdu Inventory Database

## Data Invariants
1. `inventory` items must have a unique `name` (enforced at app level, but rule should validate schema).
2. `inventory` items must have `qty >= 0`.
3. `racks` must have a valid `position` array of size 3.
4. All writes must be performed by authenticated users (for this MVP).

## The Dirty Dozen Payloads
1. Create inventory item with negative quantity.
2. Create inventory item without a name.
3. Update inventory item to set a name to a non-string.
4. Create a rack with a 1MB string as a name.
5. Create a rack with an empty position array.
6. Create a rack without authentication.
7. Update a rack to change its ID (if applicable, doc IDs are immutable anyway).
8. List inventory items without being signed in.
9. Delete an inventory item as a different user (not strictly enforced yet as we don't have ownerId, but will add ownerId).
10. Update `createdAt` field after creation.
11. Inject an "isAdmin" field into a user profile (we don't have profiles yet but good to think about).
12. Bulk list all racks bypassing the app's standard queries.

## Test Runner (Logic Check)
All above should return PERMISSION_DENIED.
