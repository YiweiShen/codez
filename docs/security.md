# Security

- **Permission Checks:** Before executing core logic, the action verifies if the triggering user (`github.context.actor`) has `write` or `admin` permissions for the repository.
- **Sensitive Information Masking:** Any occurrences of the provided `github-token` and `openai-api-key` within the output posted to GitHub are automatically masked (replaced with `***`) to prevent accidental exposure.
