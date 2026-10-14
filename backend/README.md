# Backend boundary

The monorepo keeps Firebase backend artifacts at the repository root: `functions/` contains Cloud Functions source/tests, while `database.rules.json`, `firestore.rules`, `firestore.indexes.json`, and `firebase.json` remain the deployable Firebase configuration.

The admin and customer clients reference callable names such as `adminRead`, `adminWrite`, `setStaffMembership`, and customer favorite/order functions. The included Functions source is preserved, but Production deployment remains a separate gate requiring isolated emulator tests and authenticated readback.

This directory is intentionally a documented boundary for the missing Functions source. Production Firebase data, Auth users, RTDB memberships, and SUPER_ADMIN records remain untouched by the monorepo build.
