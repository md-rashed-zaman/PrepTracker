.PHONY: compose-up compose-up-all compose-down compose-logs migrate-up test api
.PHONY: test-db

COMPOSE_FILE ?= deploy/compose/docker-compose.yml
DATABASE_URL ?= postgres://preptracker:preptracker@localhost:54320/preptracker?sslmode=disable
JWT_SECRET ?= dev-secret

compose-up:
	docker compose -f $(COMPOSE_FILE) up -d postgres

compose-up-all:
	docker compose -f $(COMPOSE_FILE) up -d --build

compose-down:
	docker compose -f $(COMPOSE_FILE) down -v

compose-logs:
	docker compose -f $(COMPOSE_FILE) logs -f --tail=200

migrate-up:
	go run ./services/api/cmd/migrate -database "$(DATABASE_URL)" -path ./services/api/migrations -up

test:
	go test ./...

test-db:
	DATABASE_URL="$(DATABASE_URL)" go test ./...

api:
	DATABASE_URL="$(DATABASE_URL)" JWT_SECRET="$(JWT_SECRET)" go run ./services/api/cmd/api
