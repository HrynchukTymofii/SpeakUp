#!/usr/bin/env bash
# Samples the local stack every N seconds while a k6 run is going (docs/load-testing.md):
# queue depth (Redis), Postgres connections + transactions, and container CPU.
# Writes CSV to stdout. Usage: load-tests/sample-local.sh 5 > samples.csv   (Ctrl+C to stop)
#
# Local only: it reads the Docker containers from infra/docker-compose.yml (project "speakup").
# On AWS the same numbers come from CloudWatch (see the doc).
set -euo pipefail
INTERVAL="${1:-5}"
REDIS_DB="${REDIS_DB:-5}"
PG=(docker exec speakup-postgres-1 psql -U speakup -d speakup -tAc)
REDIS=(docker exec speakup-redis-1 redis-cli -n "$REDIS_DB")

echo "time,queue_waiting,queue_active,pg_connections,pg_active_queries,pg_xact_total,pg_cpu_pct,redis_cpu_pct"
while true; do
  t=$(date +%H:%M:%S)
  waiting=$("${REDIS[@]}" llen bull:analysis:wait)
  active=$("${REDIS[@]}" llen bull:analysis:active)
  conns=$("${PG[@]}" "select count(*) from pg_stat_activity where datname='speakup'")
  busy=$("${PG[@]}" "select count(*) from pg_stat_activity where datname='speakup' and state='active'")
  # Commits + rollbacks since the DB started; the difference between two rows = transactions/s.
  xact=$("${PG[@]}" "select xact_commit + xact_rollback from pg_stat_database where datname='speakup'")
  cpu=$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' speakup-postgres-1 speakup-redis-1 |
    awk '{gsub("%","",$2); printf "%s,", $2}')
  echo "$t,$waiting,$active,$conns,$busy,$xact,${cpu%,}"
  sleep "$INTERVAL"
done
