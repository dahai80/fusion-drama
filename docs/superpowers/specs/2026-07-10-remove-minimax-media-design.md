# Remove MiniMax Image and Video Providers

## Goal

Remove MiniMax image and video provider support from the application and physically delete saved MiniMax image/video service configurations from MySQL.

## Scope

- Remove `minimax` from the allowed image and video provider lists.
- Remove MiniMax image/video adapters, registry entries, and configuration probe handling.
- Remove MiniMax from the settings provider selector and project documentation.
- Delete the MiniMax image and video adapter source files.
- Clear episode image/video configuration IDs that reference MiniMax before deleting those configurations, allowing the existing active-provider fallback to continue working.
- On database startup, idempotently delete MiniMax rows for `image` and `video` from `ai_service_configs` and `ai_service_providers`.
- Preserve historical generation records and generated media files.

## Runtime Behavior

Database initialization will create or update the schema first, detach affected episode configuration IDs, then run parameterized cleanup statements for MiniMax image/video provider configuration rows. Repeated starts remain safe because the updates and deletes become no-ops once the records are absent.

After removal, create, update, and test requests using MiniMax for image or video services will fail through the existing unsupported-provider validation. Existing MiniMax generation history remains readable, but no new MiniMax media tasks can be created.

## Testing

Add one structural regression test before implementation that requires:

- MiniMax to be absent from image/video allowlists and adapter registries.
- MiniMax adapter files to be absent.
- The settings provider selector and README to omit MiniMax.
- Startup database cleanup to cover both configuration tables and only image/video service types.

Verify the new test fails before implementation, then passes after the minimal deletion. Finally run the complete backend/frontend test suite, backend type checking, and frontend production build.

## Non-goals

- Do not remove unrelated MiniMax text or historical TTS references that only document already-removed functionality.
- Do not delete image/video generation history or generated files.
- Do not add migrations, dependencies, provider abstractions, or unrelated refactors.
