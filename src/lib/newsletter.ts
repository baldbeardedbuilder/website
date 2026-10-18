export interface NewsletterSignup {
  email: string;
  utm_source: string;
}

export async function submitNewsletterSignup(
  endpoint: string,
  signup: NewsletterSignup,
  request: typeof fetch = fetch
): Promise<void> {
  if (!endpoint) throw new Error('The newsletter webhook is not configured.');

  const response = await request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signup)
  });

  if (!response.ok) throw new Error('The newsletter webhook rejected the signup.');
}
