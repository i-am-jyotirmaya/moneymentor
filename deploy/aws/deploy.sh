#!/usr/bin/env bash

set -euo pipefail

IMAGE="${1:?Docker image required}"
REGION="ap-south-1"

echo "Deploying $IMAGE"

REGISTRY="$(echo "$IMAGE" | cut -d/ -f1)"

echo "Logging into ECR..."

aws ecr get-login-password \
    --region "$REGION" |
docker login \
    --username AWS \
    --password-stdin "$REGISTRY"

echo "Pulling image..."

docker pull "$IMAGE"

echo "Running database migrations..."

docker run \
    --rm \
    --env-file /opt/spndrr/.env \
    --entrypoint dotnet \
    "$IMAGE" \
    /app/operations/MoneyMentor.Operations.dll migrate

echo "Stopping old API..."

docker rm -f spndrr-api 2>/dev/null || true

echo "Starting new API..."

docker run \
    -d \
    --name spndrr-api \
    --restart unless-stopped \
    --env-file /opt/spndrr/.env \
    --log-driver=awslogs \
    --log-opt=awslogs-region=ap-south-1 \
    --log-opt=awslogs-group=/spndrr/api \
    -p 127.0.0.1:8080:8080 \
    "$IMAGE"

sleep 5

if ! docker ps --filter "name=spndrr-api" --filter "status=running" | grep -q spndrr-api; then
    echo "API failed to start"
    docker logs --tail 200 spndrr-api
    exit 1
fi

echo "Deployment successful."

docker image prune -f