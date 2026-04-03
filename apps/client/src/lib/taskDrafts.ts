const TASK_URGENCY_PATTERN = /^\d+$/;

export function parseTaskUrgency(value: string): number | null {
  const normalized = value.trim();
  if (!normalized || !TASK_URGENCY_PATTERN.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (parsed < 1 || parsed > 5) {
    return null;
  }

  return parsed;
}

export function taskUrgencyError(value: string): string | null {
  return parseTaskUrgency(value) === null ? "Urgency must be a whole number from 1 to 5." : null;
}
