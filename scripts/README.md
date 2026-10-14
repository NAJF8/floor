# Initial Super Admin provisioning

`provision-super-admins.mjs` is the trusted bootstrap path for the two initial
AL ASAS administrators. It accepts Firebase UIDs only, resolves each UID with
the Firebase Admin SDK, and requires the exact approved email, verified Auth
state, and a Google provider. It is dry-run by default and refuses to overwrite
an existing membership. Keep service-account credentials outside the repository.

After each account signs in through `/admin`, copy the displayed Firebase UID:

```text
node scripts/provision-super-admins.mjs <uid-one> <uid-two>
node scripts/provision-super-admins.mjs <uid-one> <uid-two> --commit
```
