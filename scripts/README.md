# Initial Super Admin provisioning

`provision-super-admins.mjs` is the trusted bootstrap path for the two initial
AL ASAS administrators. It accepts Firebase UIDs only, resolves each UID with
the Firebase Admin SDK, and refuses to continue unless the account is:

- exactly one of the two approved email addresses;
- verified in Firebase Authentication; and
- linked to `google.com`.

The script is dry-run by default and refuses to overwrite any existing
membership record. It requires a service-account credential through standard
Google ADC or the `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable. Never
commit a service-account key or place one in frontend environment variables.

After each approved account signs in through `/admin`, copy the displayed
Firebase UID and run:

```text
node scripts/provision-super-admins.mjs <uid-one> <uid-two>
node scripts/provision-super-admins.mjs <uid-one> <uid-two> --commit
```

The second command is the only command that writes. It creates
`shopMemberships/{uid}/floor-232bc` with `role: SUPER_ADMIN`, `active: true`,
the full permission set, and an activity-log record. Re-running it after a
successful bootstrap intentionally stops instead of overwriting records.
