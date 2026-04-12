#!/bin/bash
set -e

echo ""
echo "======================================"
echo "  Furzentic — First-Time Setup"
echo "======================================"
echo ""

# ─── 1. Check prerequisites ──────────────────────────
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required."; exit 1; }

echo "[1/6] Prerequisites OK (Node $(node -v))"

# ─── 2. Create .env from template if missing ─────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "[2/6] Created .env from .env.example"
  else
    echo "[2/6] Warning: No .env.example found. Create .env manually."
  fi
else
  echo "[2/6] .env already exists — skipping"
fi

# ─── 3. Prompt for DATABASE_URL if empty ──────────────
source .env 2>/dev/null || true

if [ -z "$DATABASE_URL" ] || [ "$DATABASE_URL" = 'postgresql://postgres:postgres@localhost:5432/furniturecrm' ]; then
  echo ""
  echo "  Current DATABASE_URL: ${DATABASE_URL:-<not set>}"
  read -p "  Enter DATABASE_URL (press Enter to keep default): " NEW_DB_URL
  if [ -n "$NEW_DB_URL" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"$NEW_DB_URL\"|" .env
    else
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"$NEW_DB_URL\"|" .env
    fi
    echo "  Updated DATABASE_URL"
  fi
fi

# ─── 4. Generate NEXTAUTH_SECRET if empty ─────────────
source .env 2>/dev/null || true

if [ -z "$NEXTAUTH_SECRET" ]; then
  SECRET=$(openssl rand -base64 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=\"$SECRET\"|" .env
  else
    sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=\"$SECRET\"|" .env
  fi
  echo "[3/6] Generated NEXTAUTH_SECRET"
else
  echo "[3/6] NEXTAUTH_SECRET already set — skipping"
fi

# ─── 5. Install dependencies ─────────────────────────
echo "[4/6] Installing dependencies..."
npm install --silent

# ─── 6. Generate Prisma client & push schema ──────────
echo "[5/6] Setting up database..."
npx prisma generate
npx prisma db push

# ─── 7. Seed database ────────────────────────────────
echo "[6/6] Seeding database with demo data..."
npx tsx prisma/seed.ts

echo ""
echo "======================================"
echo "  Setup Complete!"
echo "======================================"
echo ""
echo "  Default admin login:"
echo "    Email:    admin@furzentic.com"
echo "    Password: admin123"
echo ""
echo "  Run the app:  npm run dev"
echo "  Open:         http://localhost:3000"
echo "  DB Studio:    npm run db:studio"
echo ""
