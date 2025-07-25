# Deployment Setup

This project includes a GitHub Actions workflow that performs a blue-green deployment whenever changes are pushed to `main`.

## Required Repository Secrets

Add these secrets in your GitHub repository settings:

- `GHCR_TOKEN` – Personal access token with `write:packages` scope for pushing images to GitHub Container Registry.
- `SSH_KEY` – Content of the `docenti_main.pem` key to access the server at `ubuntu@ec2-18-204-84-112.compute-1.amazonaws.com`.
- `DEV_ENV` – *(optional)* lines to create a `.env` file on the server.

## How It Works

The workflow builds a Docker image and pushes two tags to `ghcr.io/urizennnn/exam-mode-be`: the commit SHA and the inactive colour (`blue` or `green`). After uploading `scripts/deploy.sh`, the workflow executes it over SSH. The script pulls the new image, runs it on an unused port, verifies the health endpoint, swaps the active container, and removes the old one.
