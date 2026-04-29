# Furniture CRM

A production-ready CRM for furniture stores, built with Next.js, Prisma, PostgreSQL, and Cloudflare R2.

## Features

- **Dashboard**: Real-time business overview.
- **Inventory Management**: Track stock levels with automated low-stock alerts.
- **Lead & Customer Tracking**: Manage relationships across multiple channels (WhatsApp, Instagram, Facebook).
- **Email Marketing**: Built-in campaign management with tracking pixels and A/B testing.
- **Production-Ready**: Hardened Docker configuration, secure auth, and Cloudflare R2 storage.

## Quick Start (Development)

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/shreyash1234566/Furniture-CRM.git
    cd Furniture-CRM
    ```

2.  **Run setup script**:
    ```bash
    chmod +x scripts/setup.sh
    ./scripts/setup.sh
    ```

3.  **Start development server**:
    ```bash
    npm run dev
    ```

## Production Deployment

This project is optimized for deployment on a VPS using Docker and Nginx.

### Prerequisites

- Docker and Docker Compose
- Nginx
- SSL Certificate (Let's Encrypt)
- Cloudflare R2 Bucket (for uploads)

### Steps

1.  **Configure Environment**:
    Create a `.env` file based on the requirements in `DEPLOYMENT.md`.

2.  **Deploy with Docker Compose**:
    ```bash
    docker compose up -d --build
    ```

3.  **Configure Nginx**:
    Follow the guide in `DEPLOYMENT.md` to set up the reverse proxy and HTTPS.

4.  **Set up Cron Jobs**:
    Configure system cron to trigger automated alerts as described in `DEPLOYMENT.md`.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **Storage**: Cloudflare R2 (S3-compatible)
- **Styling**: Tailwind CSS
- **Deployment**: Docker, Nginx

## License

MIT
