# Deployment Setup

This project includes a GitHub Actions workflow that performs a blue-green deployment with Docker Compose and Traefik whenever changes are pushed to `master`. The Docker image is built directly on the remote server.

## Required Repository Secrets

Add this secret in your GitHub repository settings:

- `SSH_KEY` – Content of the `docenti_main.pem` key (multiline value) used to access the remote server.

## How It Works

The workflow SSHes into the remote server, syncs the source code and configuration files to `~/exam-mode-be`, and builds the Docker image locally on the server. Deployment proceeds as follows:

1. Detect the currently active colour by reading `~/exam-mode-be/active-color` (defaults to `none`).
2. Build the Docker image locally on the server using `docker compose --profile <colour> build`.
3. Start the opposite colour (`app-blue` or `app-green`) with the new image tag using `docker compose --profile <colour> up -d`. Traefik continues to forward requests to the previously active colour during this step.
4. Wait for the new container's health check to report `healthy` and regenerate `traefik/dynamic.yml` so Traefik starts routing traffic to the new colour.
5. Stop and remove the previous colour once traffic is confirmed on the new release, then update the `active-color` marker file.

Make sure `/home/ubuntu/exam-mode-be/.env` exists on the server with the production configuration before the first deployment. Docker Compose mounts this file automatically because of the `env_file` entry in `docker-compose.yml`. The workflow also leaves the Traefik service (`:80`) running between deployments so that cut-overs happen instantly.
