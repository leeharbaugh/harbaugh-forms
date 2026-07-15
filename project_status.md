# Harbaugh Forms — Project Status

## Current State

Harbaugh Forms is a Texas real estate forms application built with:

- Next.js
- Supabase
- Vercel
- GitHub
- Cursor

## Completed Features

- Clients CRUD
- Properties CRUD
- Buyer Representation Agreements
- Listing Agreements
- Form Templates
- Packet Templates
- Generated Packets
- Soft-delete patterns
- Database-backed user preferences
- Resizable table-column preferences

## Current Architecture

### Database

- Supabase PostgreSQL
- Row Level Security
- Soft deletes using status fields
- CREATE_DATE and UPDATE_DATE fields
- User preferences stored in public.user_preferences

### PDF Forms

The current direction is a visual PDF field editor.

The application should allow users to:

1. Open a PDF form.
2. Add text, checkbox, signature, and initial fields visually.
3. Store field coordinates behind the scenes.
4. Map fields to business data.
5. Reuse fillable templates.

Do not pursue AI-generated coordinate mappings as the primary workflow.

## Important Business Rules

- Do not permanently delete business records.
- Use status or active fields for soft deletion.
- Use NA rather than leaving applicable form values blank.
- Ignore signature and initial lines during standard PDF field extraction because Authentisign handles them.
- HOA name and phone belong to property data.
- HOA Addendum transaction selections belong to packet-specific data.
- Admins viewing another user's private form should see the owner's identity rather than “Mine.”
- Promoting a private form to global should create a separate global copy and preserve the original.

## Current Work

Describe the feature currently being developed here.

## Known Issues

List unresolved bugs and technical concerns here.

## Next Steps

1. Add the immediate next task.
2. Add the task after that.
3. Note any migration, testing, or deployment work needed.

## Recent Decisions

Record significant architectural and business-rule decisions here.

## Session History

### YYYY-MM-DD

- Work completed:
- Files changed:
- Database changes:
- Tests performed:
- Unresolved issues:
- Next action: