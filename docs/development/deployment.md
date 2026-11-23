# Deployment and operations

The production stack is Docker Compose:

| Service | Image | Role |
|---|---|---|
| `db` | postgres:16-alpine | Database, volume `pgdata` |
| `backend` | built from `backend/Dockerfile` | Django + gunicorn. Runs `migrate` and `seed_landmarks` on start (both idempotent). Health check at `/health/` (includes a database ping). |
| `web` | built from `frontend/Dockerfile` | nginx: the built SPA, `/media/` straight from the shared volume, proxies `/api`, `/admin`, `/static`, `/health` to Django |
| `backup` | postgres:16-alpine | Daily `pg_dump` and media archive into `./backups`, kept for `BACKUP_KEEP_DAYS` days |
| `caddy` *(HTTPS overlay only)* | caddy:2-alpine | TLS termination with automatic Let's Encrypt certificates |

## 1. First start (local or a server)

Run from the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env        # set DJANGO_SECRET_KEY, POSTGRES_PASSWORD, DJANGO_SUPERUSER_PASSWORD, hosts
docker compose up --build -d
docker compose ps   # wait until backend and web are "healthy"
```

- Site: http://localhost:8080
- Admin: http://localhost:8080/admin/
- API docs: http://localhost:8080/api/v1/docs/

To generate a secret key:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

### Optional keys for the real map

| Variable | Effect |
|---|---|
| `ARCGIS_API_KEY` | High-resolution satellite imagery (Esri). Restrict the key to your domain in the ArcGIS dashboard, because the browser sees it. |
| `MAPILLARY_TOKEN` | Street-level photos and 360° panoramas from Mapillary. Use a *client* token, which is public by design. |

Run `docker compose up -d backend` after changing them. No frontend rebuild is needed.

## 2. HTTPS on a domain

1. Point the domain's DNS A/AAAA records at the server, and open ports 80 and 443.
2. In `.env`, set:
   - `DOMAIN=your-domain`
   - `DJANGO_ALLOWED_HOSTS=your-domain`
   - `CSRF_TRUSTED_ORIGINS=https://your-domain`
   - `CORS_ALLOWED_ORIGINS=https://your-domain`
3. Start with the overlay:

   ```powershell
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
   ```

The overlay changes the following:
- Only Caddy is exposed.
- Django gets secure cookies and HSTS.
- `TRUSTED_PROXIES=2`, so throttling sees the real client IP behind Caddy + nginx.

## 3. Backups and restore

Backups land in `./backups` on the host:
- `db_YYYY-MM-DD_HHMM.dump` (pg_dump custom format)
- `media_…tar.gz`

Copy this folder off the server as well. A backup kept on the same disk is not a backup.

Run a backup right now:

```powershell
docker compose restart backup   # the service backs up on start, then every 24 h
```

Restore the database:

```powershell
docker compose stop backend
docker compose exec -T db pg_restore -U tajikistan3d -d tajikistan3d --clean --if-exists < backups\db_2026-11-22_0300.dump
docker compose start backend
```

Restore media:

```powershell
docker compose cp backups\media_2026-11-22_0300.tar.gz backend:/tmp/media.tar.gz
docker compose exec backend sh -c "tar -xzf /tmp/media.tar.gz -C /app/media"
```

## 4. Media storage strategy

Uploaded GLBs and photos live in the named volume `media`. nginx serves them directly with long cache headers and the `model/gltf-binary` MIME type, and the backup service archives them.

For multiple servers or a CDN, move media to S3-compatible storage with `django-storages`. That is deliberately not installed today, because a single server does not need it.

## 5. Monitoring and logs

- **Health:** `GET /health/` returns `{"status":"ok","database":"ok"}`, or HTTP 503 when the database is down. Point an uptime monitor at it (for example Uptime Kuma, or any hosted checker) every 1–5 minutes.
- **Container health:** `docker compose ps` shows the backend and web health checks.
- **Logs:** everything goes to stdout, including gunicorn access logs and Django warnings and errors. Read them with:

  ```powershell
  docker compose logs -f backend web
  ```

  Set `LOG_LEVEL=DEBUG` in `.env` temporarily for more detail.

## 6. Updating

```powershell
git pull
docker compose up --build -d     # migrations run automatically on start
```

After adding landmarks in the admin, regenerate the terrain detail patches so the new places get high-resolution relief:

```powershell
tools\.venv\Scripts\python tools\terrain\build_heightmap.py --api https://your-domain
```

Commit `frontend/public/terrain` and redeploy.

## 7. Security checklist

- [ ] `DJANGO_SECRET_KEY` is long and random, and `.env` is never committed (`.gitignore` covers it).
- [ ] `DEBUG` is off. It is always `False` in `config/settings/prod.py`, and prod refuses to start with the default key.
- [ ] HTTPS overlay in use, with `DJANGO_SECURE_COOKIES=1` and HSTS.
- [ ] Strong admin password. Optionally restrict `/admin/` by IP in `frontend/nginx.conf`.
- [ ] Off-site copies of `./backups`.
- [ ] GLB uploads are checked by extension, size (15 MB) and the binary `glTF` v2 header. Images go through Pillow.
- [ ] The public API is read-only. Anonymous throttle: 600 requests/min per client IP.
