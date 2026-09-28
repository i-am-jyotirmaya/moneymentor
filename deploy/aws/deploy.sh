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

# The collector uses the EC2 instance role and is reachable only on this private Docker network.
docker network inspect spndrr-observability >/dev/null 2>&1 || docker network create spndrr-observability
docker pull public.ecr.aws/aws-observability/aws-otel-collector:v0.50.0
docker rm -f spndrr-otel 2>/dev/null || true
docker run -d \
    --name spndrr-otel \
    --restart unless-stopped \
    --memory 256m \
    --network spndrr-observability \
    --env AWS_REGION="$REGION" \
    --mount type=bind,source=/opt/spndrr/otel-collector.yaml,target=/etc/otel-collector.yaml,readonly \
    public.ecr.aws/aws-observability/aws-otel-collector:v0.50.0 \
    --config=/etc/otel-collector.yaml

sleep 2
if [ "$(docker inspect --format '{{.State.Running}}' spndrr-otel)" != "true" ]; then
    docker logs --tail 100 spndrr-otel
    exit 1
fi

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
    --env Metrics__OtlpEndpoint=http://spndrr-otel:4317 \
    --env Metrics__CoreOnly=true \
    --network spndrr-observability \
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
