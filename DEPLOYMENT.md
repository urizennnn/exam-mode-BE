# Deployment Setup

This project includes a GitHub Actions workflow that builds the Docker image and performs a blue-green deployment with Docker Compose and Traefik whenever changes are pushed to `master`.

## Required Repository Secrets

Add these secrets in your GitHub repository settings:

- `GHCR_TOKEN` – Personal access token with `write:packages` scope for pushing images to GitHub Container Registry.
- `SSH_KEY` – Content of the `docenti_main.pem` key (multiline value) used to access `ubuntu@ec2-18-204-84-112.compute-1.amazonaws.com`.

## How It Works

The workflow builds the container image with Buildx and pushes two tags to `ghcr.io/urizennnn/exam-mode-be`: the commit SHA and `latest`. It then copies `docker-compose.yml` and the Traefik templates to `~/exam-mode-be` on the server. Deployment proceeds as follows:

1. Detect the currently active colour by reading `~/exam-mode-be/active-color` (defaults to `none`).
2. Start the opposite colour (`app-blue` or `app-green`) with the new image tag using `docker compose --profile <colour> up -d`. Traefik continues to forward requests to the previously active colour during this step.
3. Wait for the new container’s health check to report `healthy` and regenerate `traefik/dynamic.yml` so Traefik starts routing traffic to the new colour.
4. Stop and remove the previous colour once traffic is confirmed on the new release, then update the `active-color` marker file.

Make sure `/home/ubuntu/exam-mode-be/.env` exists on the server with the production configuration before the first deployment. Docker Compose mounts this file automatically because of the `env_file` entry in `docker-compose.yml`. The workflow also leaves the Traefik service (`:80`) running between deployments so that cut-overs happen instantly.
