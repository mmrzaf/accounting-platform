# Initial company bootstrap and recovery

There is **one Company boundary only**. The trusted local installation operator may create independent companies; each has its own users, chart, ledger and AI settings. Ordinary users never create or switch companies. No public registration and no company slug at login.

## Initial setup

```sh
pnpm run setup
pnpm run db:migrate
pnpm run app:bootstrap -- --name "Example Company" --admin-username owner --admin-name "Owner"
pnpm run app:serve
```

The CLI prompts securely for a strong administrator password. Never pass passwords on the command line. Usernames are globally unique across the entire installation. The initial administrator receives the `company-admin` role; newly created users start without roles until assigned.

## Trusted administrator recovery

```sh
pnpm run app:recover-admin -- --admin-username owner
```

This CLI-only operation requires privileged filesystem/operator access, replaces the administrator's password using hidden input, revokes sessions, clears lockout and records an audit event. It cannot recover arbitrary nonadmin users or be invoked over the HTTP interface.
