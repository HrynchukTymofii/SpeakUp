#!/bin/sh
# Container entrypoint for api, worker and migrate images.
#
# On ECS the database credentials arrive as DB_SECRET: the JSON that RDS keeps in Secrets
# Manager ({"username","password","host","port","dbname",...}). Our apps expect one
# DATABASE_URL, so we build it here. The password is URL-encoded (a generated password can
# contain characters like ":" or "/" that would break the URL). Locally DATABASE_URL is
# already set and this step is skipped.
set -eu

if [ -z "${DATABASE_URL:-}" ] && [ -n "${DB_SECRET:-}" ]; then
  DATABASE_URL="$(node -e '
    const s = JSON.parse(process.env.DB_SECRET);
    const e = encodeURIComponent;
    process.stdout.write(
      `postgresql://${e(s.username)}:${e(s.password)}@${s.host}:${s.port}/${e(s.dbname)}?sslmode=verify-full`,
    );
  ')"
  export DATABASE_URL
fi
unset DB_SECRET

# exec: the app replaces this shell as PID 1, so it receives ECS's SIGTERM directly and can
# shut down gracefully.
exec "$@"
