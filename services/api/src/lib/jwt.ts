const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-in-production",
);

export function getJwtSecret() {
  return secret;
}
