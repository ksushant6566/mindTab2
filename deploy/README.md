# MindTab V2 Production Deploy

Every push to `main` runs `.github/workflows/deploy.yml`.

The workflow:

1. Builds `ghcr.io/ksushant6566/mindtab-v2-api:<sha>`.
   - Contains the Go API.
   - Contains the built Vite web app at `/static`.
   - Contains the DB migration CLI and SQL migrations.
2. Builds `ghcr.io/ksushant6566/mindtab-v2-landing:<sha>`.
   - Serves the Astro landing page with nginx.
3. SSHes into the Oracle VM.
4. Writes `/opt/mindtab/env/api.env`.
5. Runs migrations against the remote Postgres `DATABASE_URL`.
6. Replaces the running containers.
7. Reloads host nginx.

## Domains

- `api.mindtab.in` -> API container on `127.0.0.1:8080`
- `app.mindtab.in` -> same API container on `127.0.0.1:8080`, serving the Vite SPA
- `mindtab.in` and `www.mindtab.in` -> landing container on `127.0.0.1:8081`

## Required GitHub Secrets

Add these in GitHub: `Settings -> Secrets and variables -> Actions -> Secrets`.

- `VM_HOST`
- `VM_USERNAME`
- `VM_SSH_PRIVATE_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `RESEND_API_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `JINA_API_KEY`
- `GROQ_API_KEY`
- `X_BEARER_TOKEN`
- `LETSENCRYPT_EMAIL`

If GHCR packages are private, also add:

- `GHCR_PAT` with `read:packages`

## Optional GitHub Variables

Add these in GitHub: `Settings -> Secrets and variables -> Actions -> Variables`.
They can be omitted; the server has defaults for blank values.

- `REDDIT_USER_AGENT`
- `GEMINI_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS`
- `WORKER_CONCURRENCY`
- `WORKER_SHUTDOWN_TIMEOUT`
- `MAX_FILE_SIZE_MB`
- `YOUTUBE_MAX_DURATION_SEC`
- `YOUTUBE_VIDEO_QUALITY`
- `YOUTUBE_FRAMES_PER_MIN_CAP`

## One-Time VM Setup

Install Docker, nginx, and certbot on the Oracle VM. Docker Compose is not required for production deploys.

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl nginx certbot python3-certbot-nginx
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Make sure the SSH user can run `sudo docker`, `sudo nginx`, and `sudo systemctl reload nginx`.

The workflow disables old enabled nginx site entries that claim `mindtab.in`, `www.mindtab.in`, `app.mindtab.in`, or `api.mindtab.in` before reloading nginx.

The workflow requests the first TLS certificate automatically when `LETSENCRYPT_EMAIL` is set and `certbot` is installed. It uses a stable certificate name, `mindtab.in`, then rewrites nginx into permanent HTTPS mode.

If you want to issue the certificate manually instead, use the same certificate name:

```sh
sudo certbot --nginx --cert-name mindtab.in -d mindtab.in -d www.mindtab.in -d app.mindtab.in -d api.mindtab.in
```

## Manual Rollback

Use the previous SHA from GitHub Actions logs:

```sh
API_IMAGE=ghcr.io/ksushant6566/mindtab-v2-api:PREVIOUS_SHA
LANDING_IMAGE=ghcr.io/ksushant6566/mindtab-v2-landing:PREVIOUS_SHA
sudo docker pull "$API_IMAGE"
sudo docker pull "$LANDING_IMAGE"
sudo docker rm -f mindtab-api mindtab-landing
sudo docker run -d --name mindtab-api --restart unless-stopped --env-file /opt/mindtab/env/api.env -p 127.0.0.1:8080:8080 -v mindtab_media:/data/mindtab/media "$API_IMAGE"
sudo docker run -d --name mindtab-landing --restart unless-stopped -p 127.0.0.1:8081:80 "$LANDING_IMAGE"
```
