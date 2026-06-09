#!/usr/bin/env bash
# Shared staging NewAPI Postgres snapshot filename/path defaults.

STAGING_BACKUP_FILENAME="${STAGING_BACKUP_FILENAME:-xbh-new-api-2026-06-09-174203.sql.gz}"
STAGING_REMOTE_DIR="${STAGING_REMOTE_DIR:-/opt/easyapi-portal-test}"
STAGING_BACKUP_SQL_GZ="${STAGING_BACKUP_SQL_GZ:-${STAGING_REMOTE_DIR}/${STAGING_BACKUP_FILENAME}}"
