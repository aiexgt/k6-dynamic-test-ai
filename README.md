# 🚀 Magento Flow Runner & Testing Suite

An advanced, developer-first orchestration, benchmarking, and end-to-end testing platform for **Magento 2 (Adobe Commerce)** GraphQL and REST APIs. Build, validate, version, and measure complex checkout workflows with microsecond precision from an intuitive visual interface without writing testing code.

---

## 🌟 Key Features

### 1. 🧩 Dynamic Visual Flow Runner (Playground)
* **Pipeline Orchestrator:** Compose custom multi-step checkout pipelines dynamically with step reordering, skipping (e.g. virtual products without delivery), and variable mappings.
* **Smart Context Propagation:** Automatically captures and passes context variables (`cartId`, `customerToken`, `orderNumber`, `maskedId`) down the pipeline.
* **On-the-Fly Overrides:** Customize headers and variables per step without altering the shared baseline variant.
* **Step-by-Step & Batch Runner:** Execute pipelines step-by-step to inspect intermediate states or run end-to-end with deep latency breakdown.

### 2. 🏛️ Dual-Database Architecture
Designed for modern teams that collaborate on testing recipes while keeping secrets private:
* **🌐 Shared Central Database (PostgreSQL):** Holds shared **Flows**, **Variants**, **Categories**, and full **Version History**. Changes made here sync instantly across the entire engineering and QA team.
* **🐘 Private Local Database (Docker PostgreSQL):** Stores private developer **Environments**, **Magento Auth Tokens**, **API Credentials**, and local **Latency Benchmarks**. Secrets remain safely on the local machine and are never shared.

### 3. 🕒 Automated Versioning & 1-Click Rollback
* **Point-in-Time Snapshots:** Every time a Flow, Variant, or Category is created or modified, an atomic snapshot is preserved in `item_versions`.
* **Complete Audit Trail:** Displays version number (`v1`, `v2`, `v3`...), timestamp, change summary, and author attribution (`updatedByName` and `updatedBy`).
* **Instant Rollback:** Restore any previous state with a single click.

### 4. 🔒 Cooperative Flow Locking & Authorship
* **Soft Locks:** Mark critical master flows as locked to signal to the team that a recipe is in production validation.
* **Zero Permission Bottlenecks:** Any developer can unlock or safely edit when needed, maintaining agility without bureaucratic restrictions.
* **Full Authorship:** Transparently records the author of every change.

### 5. 🔬 Built-In GraphQL & REST Sandbox
* **Interactive Testing Sandbox:** Test queries, mutations, and REST endpoints directly against your active environment with syntax highlighting, variable auto-completion, and response time metrics.
* **Schema Introspection:** Inspect types, queries, and mutations live from your Magento 2 instance.
* **Mock Simulator:** Includes an embedded Magento 2 mock service to test checkout flows offline without requiring an active Magento instance.

### 6. 🛡️ Assertions & Automated Validations
* Validate status codes (HTTP 200), GraphQL `errors[]` blocks, maximum response latency thresholds, and JSON path matchers.
* Combine **Global Suite Tests** (run on every step) with **Custom Step Validations**.

### 7. 🗑️ Soft Delete & Recycle Bin
* Prevents accidental loss: deleted flows and variants move to the Trash Bin and can be restored or purged permanently at any time.

---

## 📋 Typical Checkout Pipeline Stages

| Stage | Description | Typical Magento 2 Endpoint / Mutation |
|---|---|---|
| **Cart Creation** | Anonymous Guest Cart or Customer Token | `createEmptyCart` / `generateCustomerToken + customerCart` |
| **Add Items** | Simple, Configurable, or Virtual Products | `addSimpleProductsToCart` / `addConfigurableProductsToCart` |
| **Shipping Address** | Delivery address, NIT, coordinates, notes | `setShippingAddressesOnCart` |
| **Shipping Method** | Carrier selection (Tablerate, Flatrate, Pickup) | `setShippingMethodsOnCart` |
| **Billing Address** | Tax address / same as shipping | `setBillingAddressOnCart` |
| **Discounts & Coupons**| Promotional codes & vouchers | `applyCouponToCart` |
| **Payment Method** | Payment gateway tokenization | `setPaymentMethodOnCart` |
| **Place Order** | Order generation & quote finalization | `placeOrder` |

---

## 🛠️ Tech Stack

* **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
* **Backend:** Node.js, Express, TypeScript, `pg` (PostgreSQL client)
* **Database:** PostgreSQL 16 (Local Docker container & optional Central Shared PostgreSQL instance)
* **Containerization:** Docker & Docker Compose

---

## 🚀 Getting Started

### Prerequisites
* [Docker Desktop](https://www.docker.com/) (recommended)
* [Node.js](https://nodejs.org/) v18+ (for manual local development)

### 1. Clone the Repository
```bash
git clone https://github.com/aiexgt/k6-dynamic-test-ai.git
cd k6-dynamic-test-ai
```

### 2. Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env
```

Review `.env`:
```env
PORT=4000
NODE_ENV=production

# Local Private Database (Docker)
DATABASE_URL=postgresql://runner:runner_password@localhost:5432/flowrunner
LOCAL_DATABASE_URL=postgresql://runner:runner_password@localhost:5432/flowrunner

# Central Shared Database (Optional: point to your team's PostgreSQL instance)
# SHARED_DATABASE_URL=postgresql://user:password@shared-db.internal:5432/flowrunner_shared
```
*(If `SHARED_DATABASE_URL` is omitted, the app automatically defaults to using the unified local database).*

### 3. Run with Docker Compose (Recommended)
```bash
docker compose up -d --build
```
Open your browser at: **[http://localhost:4000](http://localhost:4000)**

---

## 💻 Local Development Setup (Manual)

To run backend and frontend separately with hot-reloading:

```bash
# 1. Install root, client, and server dependencies
npm run install:all

# 2. In Terminal 1 - Start the backend API server (port 4000)
npm run dev:server

# 3. In Terminal 2 - Start the frontend Vite dev server (port 3000)
npm run dev:client
```
Access the development frontend with Hot Reload at **[http://localhost:3000](http://localhost:3000)**.

---

## 📁 Project Structure

```
├── client/                     # Frontend Application (React + Vite + Tailwind)
│   ├── src/
│   │   ├── components/         # Playground, Flows, Variants, Categories, Environments
│   │   ├── context/            # Toast, Confirm, and Feedback dialogs
│   │   ├── types.ts            # Frontend data models & types
│   │   └── api.ts              # API client & HTTP helpers
│   └── vite.config.ts
├── server/                     # Backend API (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── routes/             # REST endpoints (/api/flows, /api/variants, /api/versions...)
│   │   ├── services/           # Pipeline executor & Magento mock engine
│   │   ├── storage/            # Dual-database layer (db.ts) & migrations
│   │   └── types/              # Backend interfaces
│   └── data/                   # Default seed variants, flows, and categories
├── scripts/                    # Database maintenance & testing utilities
├── docker-compose.yml          # App & PostgreSQL multi-container definition
├── Dockerfile                  # Multi-stage production container build
├── .env.example                # Sanitized environment configuration template
└── README.md                   # Documentation
```

---

## 🔒 Security & Privacy Notice

* **Never commit `.env` or sensitive `.json` backup files.** The repository includes a pre-configured `.gitignore` that prevents private environments, auth tokens, and database dumps from being tracked.
* Keep production tokens and credentials confined to your local private database or local environment settings.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
