export function splitByCatalog(values: string[], catalog: readonly string[]) {
  const catalogLower = new Set(catalog.map((entry) => entry.toLowerCase()));
  const predefined: string[] = [];
  const custom: string[] = [];

  for (const value of values) {
    if (catalogLower.has(value.toLowerCase())) {
      predefined.push(value);
    } else {
      custom.push(value);
    }
  }

  return { predefined, custom };
}

export function accountMetaLine(displayName?: string | null, email?: string | null) {
  const parts = [displayName?.trim(), email?.trim()].filter(Boolean);
  if (parts.length === 0) {
    return 'No active session';
  }
  return parts.join(' · ');
}

export function prettyStatus(status: string) {
  if (!status) return '\u2014';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function summarizeHealthList(values: string[] | null | undefined) {
  if (!values?.length) return 'Tap to configure';
  if (values.length === 1) return values[0] ?? 'Configured';
  if (values.length === 2) return values.join(', ');
  return `${values.slice(0, 2).join(', ')} +${values.length - 2}`;
}

export function summarizeDietPreferences(
  profileDietPreferences: { label: string }[] | null | undefined,
) {
  if (!profileDietPreferences?.length) {
    return 'No specific diet';
  }

  if (profileDietPreferences.length === 1) {
    return profileDietPreferences[0]?.label ?? 'Configured';
  }

  return `${profileDietPreferences.length} diet goals`;
}
