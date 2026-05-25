Create an application at <https://dashboard.clerk.com> and copy the API keys into `.env`:

```sh
{{#if (eq peers.framework "next")}}echo "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_..." >> .env{{else}}echo "CLERK_PUBLISHABLE_KEY=pk_test_..." >> .env{{/if}}
echo "CLERK_SECRET_KEY=sk_test_..." >> .env
```

`<ClerkProvider>` is already wrapped around your root layout. Use `auth()` / `currentUser()` (server) or `useUser()` / `<SignIn />` / `<UserButton />` (client) — see the [Clerk docs](https://clerk.com/docs) for the full API.
