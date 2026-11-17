type AuthUser = { id: string; email?: string };
type ListUsers = (options: { page: number; perPage: number }) => Promise<{
  data: { users: AuthUser[] } | null;
  error: { message: string } | null;
}>;

export async function findAuthUserByEmail(listUsers: ListUsers, email: string): Promise<AuthUser | null> {
  const target = email.trim().toLowerCase();
  const seen = new Set<string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await listUsers({ page, perPage: 200 });
    if (error || !data) throw new Error('Unable to read auth users');
    const match = data.users.find(user => user.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length === 0) return null;
    // Never interpret an incomplete/repeated page as proof that the account is absent.
    const fingerprint = JSON.stringify(data.users.map(user => user.id));
    if (seen.has(fingerprint)) throw new Error('Auth user pagination did not advance');
    seen.add(fingerprint);
  }
}
