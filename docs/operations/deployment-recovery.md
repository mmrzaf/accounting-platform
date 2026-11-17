# Deployment and recovery boundaries

The current host is a Node HTTP API, one process per installation, backed by a local SQLite WAL database and a managed attachment directory. Node 24 is the primary target; Windows, macOS, Node 24 and Node 26 remain unverified execution environments until the CI matrix is actually run.

- **Network:** bind only to a loopback address. For other machines on a LAN, use an explicitly configured HTTPS reverse proxy forwarding to loopback. Validate its Host/origin behavior and TLS before deployment.
- **Storage:** local filesystem for WAL database and attachments; never operate SQLite WAL from SMB/NFS shares. Restrict file permissions and backups.
- **Startup:** explicitly apply migrations and bootstrap administration before starting the server. Startup rejects missing or pending migrations.
- **Recovery:** use only the single database-and-attachments bundle format. Verify it and restore to new paths; stop the service and reconcile business records before any operational cutover.
- **Key management:** keep AI credential-encryption master keys in a separately secured operator-managed secret backup. A database backup alone cannot recover this key.
- **Availability:** backup scheduling, offsite retention, encrypted archival, integrity drills and measured RPO/RTO are operational work, not built-in guarantees.

The API is not a production-released browser application. The complete list of missing release gates is maintained in [implementation status](../validation/implementation-status.md) and [release gates](../validation/release-gates.md).
