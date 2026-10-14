# Backend boundary

The source repositories contain Firebase client applications, Realtime Database rules, and admin provisioning/emulator scripts. They do not contain deployable Cloud Functions source.

The admin client currently references deployed callable names such as `adminRead`, `adminWrite`, and `setStaffMembership`. Those deployed functions are an external Production dependency and must not be recreated, replaced, or deployed from this merge without an audited source backup and an isolated emulator/restore test.

This directory is intentionally a documented boundary for the missing Functions source. Production Firebase data, Auth users, RTDB memberships, and SUPER_ADMIN records remain untouched by the monorepo build.
