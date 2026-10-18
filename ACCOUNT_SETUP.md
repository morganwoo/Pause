# PAUSE! — accounts + guest mode setup

The ZIP contains the **complete project**. Keep the existing `backend` root directory on Railway.

## 1. Supabase SQL (required before deployment)

Open **Supabase → SQL Editor → New query**, paste `SUPABASE_SETUP.sql`, and run it once.

This adds `user_id` to existing items and creates `user_budgets` for private budgets. **Old items with `user_id = NULL` will not appear in anyone's account.** They are intentionally not assigned to an arbitrary user. Existing data remains in the database.

## 2. Railway variables (required)

In the Railway **backend service → Variables**, retain the working `DB_PASSWORD` and add:

- `SUPABASE_URL` — Supabase Project URL, for example `https://YOUR_PROJECT_REF.supabase.co`
- `SUPABASE_ANON_KEY` — Supabase publishable/anon API key (NOT the service-role/secret key). Find it under Supabase Project Settings → API Keys.

Do not put the database password or Supabase secret/service-role key into JavaScript, Git, or the ZIP. The **publishable/anon key is meant to be public**, but must be paired with proper RLS and server-side token checks.

Supabase **Authentication → Sign In / Providers → Email** should be enabled. If **Confirm email** is enabled, new users must confirm their email before logging in. Configure your Supabase Auth URL settings / allowed redirect URLs as appropriate for the Railway domain.

## 3. Deploy

Replace the project files in your Git checkout (preserve your `.git` directory), then:

```sh
git add .
git commit -m "Add Supabase Auth, private user data, and guest mode"
git push origin main
```

Railway should rebuild automatically. Open your Railway URL after the new deployment is active.

## 4. Test

1. Open site in a private browser window → continue as guest → create a quest → refresh. It should stay in that browser only.
2. Sign up with account A, confirm email if required, log in → create a quest and set budget.
3. Sign out → see guest quests again (not account A's data).
4. Sign in with account B → should see **no account A quests** and default $500 budget.
5. Open `/items` in the browser without a bearer token → should return HTTP **401**.
6. Verify that a user cannot PATCH an item owned by another user (should return 404).

## Notes / limits

- User identity is verified on the Spring Boot server by asking Supabase Auth `/auth/v1/user` to validate each access token; the server then scopes SQL by `user_id`. No client-supplied user IDs are trusted.
- Browser guest mode uses localStorage. Guest items do **not** automatically migrate to accounts.
- Desire ratings are currently browser-local, including when signed in; they are not synchronized across devices.
- Account sessions are stored in localStorage for this hackathon prototype. For production, consider secure httpOnly cookie sessions and stronger CSRF/XSS controls.
- Legacy `app_budget` remains unused by the new private budget endpoints.
- You should rotate your Supabase DB password if it was shown in any screenshots or shared logs.
