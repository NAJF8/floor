# AL ASAS Flower Commerce — Admin

This directory is a standalone Vite/React application intended for the `NAJF8/floor-admin` repository and `https://najf8.github.io/floor-admin/`.

It uses Firebase project `floor-232bc` and the existing Realtime Database. Access is granted only after Google Sign-In, verified email, and an active Firebase UID membership for the shop. Email matching in the browser never grants a role.

Provisioning is trusted-server only. Run a dry run first:

```bash
npm run provision:super-admins -- <verified-uid-1> <verified-uid-2>
```

After reviewing the resolved Firebase Auth identities and existing-membership checks, use `--commit`. Credentials must be supplied through `FIREBASE_SERVICE_ACCOUNT_JSON` or Application Default Credentials and must never be committed.
