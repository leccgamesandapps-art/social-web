# le-social-web

Vercel project: **le-social-web**  
GitHub repo: **social-web** (synced from le-social-web)

## Pages
- `/` index — user login/register
- `/dashboard` — feed, search, create, profile, friends, settings
- `/chat` — DM / GC / Community
- `/admin` — admin panel (password)
- `/owner` — owner panel (password)
- `/help` — AI Help Center + 72h account deletion

## Auth
| Role | Table | Entry |
|------|-------|-------|
| User | users | `/` username+password |
| Admin | admins | `/admin` password only |
| Owner | owner | `/owner` password only |
