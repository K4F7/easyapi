# EZAPI Portal

## Local test compose with backup database

`docker-compose.easyapi-portal-test.yml` is the only compose file for local backup-database testing. It is separate from `docker-compose.official-newapi.yml` and uses the Compose project name `easyapi-portal`, independent test containers, an independent test network, and independent test volumes.

The test Postgres service mounts a backup SQL gzip into `/docker-entrypoint-initdb.d/10-xbh-new-api.sql.gz` as read-only. By default it uses the local backup at `D:\Download\xbh-new-api-2026-05-23-172431.sql.gz`. Set `BACKUP_SQL_GZ` if the backup is stored somewhere else.

Use forward slashes for Windows paths when setting `BACKUP_SQL_GZ`, for example `D:/Download/xbh-new-api-2026-05-23-172431.sql.gz`, because Docker Compose treats backslashes as escapes in some shells.

The official Postgres image imports this dump only when it initializes an empty data directory for the first time. If the test Postgres volume `easyapi-portal_pg_data_test` already exists, Postgres keeps the existing database and does not re-run init files.

This file is for local testing only. Do not use it with production data volumes, do not point it at production services, and do not modify production compose files for backup-database testing.
