# Common backend commands.  All assume Postgres is reachable via DATABASE_URL
# (or the default verify/verify@localhost:5432/verify connection string).

.PHONY: build run seed test test-verbose test-race test-cover lint vet ci

build:
	go build ./...

run:
	go run ./cmd/server

seed:
	go run ./cmd/seed

# `-p 1` serializes packages because they share the verify_test database.
test:
	go test -p 1 ./...

test-verbose:
	go test -p 1 -v ./...

# Adds the data-race detector.  Requires CGO (CGO_ENABLED=1).  Linux runners
# in CI have it; Windows dev machines may not.
test-race:
	go test -p 1 -race ./...

test-cover:
	go test -p 1 -coverpkg=./internal/... -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out | tail -25

lint:
	go vet ./...

vet: lint

# What CI runs.  Keep in sync with .github/workflows/ci.yml.
ci: lint test-cover
