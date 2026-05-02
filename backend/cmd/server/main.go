package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/verify/backend/internal/api"
	"github.com/verify/backend/internal/db"
	"github.com/verify/backend/internal/store"
)

func main() {
	_ = godotenv.Load(".env", "../.env")
	ctx := context.Background()

	pool, err := db.Connect(ctx)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	st := store.New(pool)
	if _, err := st.CurrentUser(ctx); err != nil {
		log.Fatalf("seed user: %v", err)
	}

	srv := &http.Server{
		Addr:              ":" + portOrDefault(),
		Handler:           api.New(st).Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("[verify-api] listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	shutdown, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
}

func portOrDefault() string {
	if p := os.Getenv("PORT"); p != "" {
		return p
	}
	return "4000"
}
