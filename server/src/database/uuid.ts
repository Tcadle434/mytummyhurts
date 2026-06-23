const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Defense-in-depth: the userId comes from a verified JWT, but it is interpolated
// into `SET LOCAL app.current_user_id`, so we hard-validate it as a UUID first.
export function assertUuid(value: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error('invalid_user_id');
  }
  return value;
}
