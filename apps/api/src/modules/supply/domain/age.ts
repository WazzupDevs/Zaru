/**
 * Whole-year age between birthDate and `now`. Birthday boundary is inclusive
 * (you turn N on the morning of your Nth birthday; pre-birthday you're still N-1).
 */
export function calculateAge(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}
