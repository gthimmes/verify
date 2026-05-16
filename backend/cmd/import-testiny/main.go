// import-testiny ingests a Testiny .xlsx export into a Verify project.
//
// Usage:
//
//	import-testiny --xlsx <path> --project-key <KEY> [--dry-run]
//	import-testiny --xlsx <path> --project-key <KEY> --create-project --project-name "Foo"
//
// The default mode is --dry-run for safety; pass --apply to write.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"

	"github.com/verify/backend/internal/db"
	"github.com/verify/backend/internal/domain"
	"github.com/verify/backend/internal/importer"
	"github.com/verify/backend/internal/store"
)

var _ = errors.New // unused-import shield

func main() {
	xlsxPath := flag.String("xlsx", "", "path to the Testiny .xlsx export")
	projectKey := flag.String("project-key", "", "Verify project key to import into")
	createProject := flag.Bool("create-project", false, "create the project if it doesn't exist")
	projectName := flag.String("project-name", "", "name for the project (required with --create-project)")
	apply := flag.Bool("apply", false, "actually write to the database (default is dry-run)")
	flag.Parse()

	if *xlsxPath == "" || *projectKey == "" {
		flag.Usage()
		log.Fatal("--xlsx and --project-key are required")
	}

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
	s := store.New(pool)
	user, err := s.CurrentUser(ctx)
	if err != nil {
		log.Fatalf("current user: %v", err)
	}

	// resolve or create the project
	project, err := s.GetProjectByKey(ctx, *projectKey)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		log.Fatalf("find project: %v", err)
	}
	if project == nil {
		if !*createProject {
			log.Fatalf("project with key %q not found; pass --create-project --project-name to create it", *projectKey)
		}
		if *projectName == "" {
			log.Fatalf("--create-project requires --project-name")
		}
		if !*apply {
			// dry-run: don't touch the database; fabricate a placeholder so
			// the planner has something to attach the report to.
			project = &domain.Project{
				ID: "(dry-run)", Key: *projectKey, Name: *projectName,
				OwnerID: user.ID, OwnerName: user.Name,
			}
			fmt.Printf("[importer] (dry-run) would create project %s (%s)\n", project.Name, project.Key)
		} else {
			project, err = s.CreateProject(ctx, domain.CreateProjectInput{
				Name: *projectName, Key: *projectKey,
				Description: "Imported from Testiny",
			}, user.ID)
			if err != nil {
				log.Fatalf("create project: %v", err)
			}
			fmt.Printf("[importer] created project %s (%s)\n", project.Name, project.Key)
		}
	}

	rows, skipped, err := importer.Read(*xlsxPath)
	if err != nil {
		log.Fatalf("read xlsx: %v", err)
	}
	for _, sk := range skipped {
		fmt.Fprintf(os.Stderr, "[importer] skipped sheet: %s\n", sk)
	}

	plan := importer.PlanRows(rows, project)
	importer.PrintSummary(os.Stdout, plan)

	if !*apply {
		fmt.Println("(dry-run) pass --apply to write")
		return
	}
	res, err := importer.Apply(ctx, s, plan, user.ID)
	if err != nil {
		log.Fatalf("apply: %v", err)
	}
	fmt.Printf("\n[importer] done. folders=%d cases=%d\n",
		res.FoldersCreated, res.CasesCreated)
}

