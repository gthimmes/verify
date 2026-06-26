package store

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/verify/backend/internal/domain"
)

// MaxAttachmentBytes caps a single upload. Bytes are stored inline (bytea), so
// keep this modest until blobs move to object storage.
const MaxAttachmentBytes = 10 * 1024 * 1024 // 10 MiB

func validAttachmentEntity(t string) bool {
	return t == "test_case" || t == "execution"
}

// AddAttachment decodes the base64 payload, enforces the size cap, and stores
// the file against its entity. Returns the metadata (without the bytes).
func (s *Store) AddAttachment(ctx context.Context, in domain.CreateAttachmentInput, userID string) (*domain.Attachment, error) {
	if !validAttachmentEntity(in.EntityType) {
		return nil, fmt.Errorf("invalid entity type %q", in.EntityType)
	}
	in.Filename = strings.TrimSpace(in.Filename)
	if in.Filename == "" {
		return nil, fmt.Errorf("filename required")
	}
	raw, err := base64.StdEncoding.DecodeString(in.Data)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 payload")
	}
	if len(raw) == 0 {
		return nil, fmt.Errorf("empty file")
	}
	if len(raw) > MaxAttachmentBytes {
		return nil, fmt.Errorf("file too large (max %d MB)", MaxAttachmentBytes/(1024*1024))
	}
	contentType := strings.TrimSpace(in.ContentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var a domain.Attachment
	if err := tx.QueryRow(ctx, `
		insert into attachments(entity_type, entity_id, filename, content_type, size_bytes, data, uploaded_by_id)
		values($1, $2, $3, $4, $5, $6, $7)
		returning id::text, entity_type, entity_id::text, filename, content_type, size_bytes, created_at`,
		in.EntityType, in.EntityID, in.Filename, contentType, len(raw), raw, userID,
	).Scan(&a.ID, &a.EntityType, &a.EntityID, &a.Filename, &a.ContentType, &a.SizeBytes, &a.CreatedAt); err != nil {
		return nil, err
	}
	if err := writeAudit(ctx, tx, userID, "attachment.add", "Attachment", a.ID,
		nil, map[string]any{"filename": a.Filename, "entityType": a.EntityType, "entityId": a.EntityID}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &a, nil
}

// ListAttachments returns metadata (no bytes) for an entity's files, oldest first.
func (s *Store) ListAttachments(ctx context.Context, entityType, entityID string) ([]domain.Attachment, error) {
	if !validAttachmentEntity(entityType) {
		return nil, fmt.Errorf("invalid entity type %q", entityType)
	}
	rows, err := s.Pool.Query(ctx, `
		select a.id::text, a.entity_type, a.entity_id::text, a.filename, a.content_type,
		       a.size_bytes, coalesce(u.name, ''), a.created_at
		from attachments a
		left join users u on u.id = a.uploaded_by_id
		where a.entity_type = $1 and a.entity_id = $2
		order by a.created_at`, entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Attachment{}
	for rows.Next() {
		var a domain.Attachment
		if err := rows.Scan(&a.ID, &a.EntityType, &a.EntityID, &a.Filename, &a.ContentType,
			&a.SizeBytes, &a.UploadedByName, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// GetAttachmentBlob returns the bytes and headers needed to serve a download.
func (s *Store) GetAttachmentBlob(ctx context.Context, id string) (filename, contentType string, data []byte, err error) {
	err = s.Pool.QueryRow(ctx,
		`select filename, content_type, data from attachments where id = $1`, id,
	).Scan(&filename, &contentType, &data)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil, ErrNotFound
	}
	return filename, contentType, data, err
}

// DeleteAttachment removes a file. Unknown ids return ErrNotFound.
func (s *Store) DeleteAttachment(ctx context.Context, id, userID string) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `delete from attachments where id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if err := writeAudit(ctx, tx, userID, "attachment.delete", "Attachment", id, nil, nil); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
