# Social Web

5 pages · Supabase · Vercel

## Pages
| URL | File | Role |
|-----|------|------|
| `/` | index.html | User login/register (users table) |
| `/dashboard` | dashboard.html | Feed, search, create, profile, friends, settings |
| `/chat` | chat.html | DM / GC / Community |
| `/admin` | admin.html | Admin panel (admins table, password only) |
| `/owner` | owner.html | Owner panel (owner table, password only) |

## Folders
```
api/           auth.js admin.js posts.js chat.js report.js + lib/
assets/css/    core auth dashboard chat panel
assets/js/     api auth-page dashboard chat admin owner
schema-RESET.sql
```

## Auth
- **U** users table → index login → dashboard + chat
- **A** admins table → /admin password only → moderate users only
- **O** owner table → /owner password only → manage admins + users
