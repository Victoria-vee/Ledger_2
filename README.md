# Ledger

Ledger is an AI-assisted finance tracker and pricing calculator for small businesses. It helps business owners track income and expenses, calculate selling prices, and get AI-powered pricing recommendations.

## Features

- **Dashboard:** View business-specific income, expenses, net balance, and recent transactions.
- **Business Management:** Create and switch between business profiles.
- **Transaction Tracking:** Create, view, edit, delete, search, and filter income and expense records.
- **Price Calculator:** Calculate selling prices using costs and markup.
- **AI Pricing Advice:** Get AI-generated pricing recommendations through Groq.
- **Saved Prices:** Save, view, update, and delete product or service pricing records.
- **AI Transaction Entry:** Generate transaction drafts from natural-language descriptions and review them before saving.

Ledger stores business, transaction, and pricing data in MongoDB Atlas. AI-generated content requires review before it is used.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** MongoDB Atlas, Mongoose
- **AI:** Groq API
- **Deployment:** Render

## Getting Started

### Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- A MongoDB Atlas database
- A Groq API key for AI features

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Victoria-vee/Ledger_2.git
cd Ledger_2
npm install
```

Create a local environment file from the server template:

```bash
cp server/.env.example server/.env
```

On Windows PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

Configure the required environment variables in `server/.env`, using the variable names expected by the backend. These include your MongoDB connection string and Groq API key.

Never commit environment files or expose API keys in frontend code.

### Run Locally

Start the frontend and backend together:

```bash
npm run dev
```

By default, the development frontend runs at `http://localhost:5173` and the API runs at `http://localhost:5000`.

The API health endpoint is available at:

```text
http://localhost:5000/api/health
```

### Build and Test

Run TypeScript checks:

```bash
npm run typecheck
```

Build the frontend and backend:

```bash
npm run build
```

Run the backend tests:

```bash
npm run test --workspace=server
```

## Deployment

Ledger is deployed on Render, with the Express server serving the built frontend and API.

Deployment configuration is maintained in `render.yaml`.

Configure the required environment variables in the Render dashboard, including the MongoDB connection string and Groq API credentials. Ensure MongoDB Atlas permits connections from the deployed service.

The health endpoint is:

```text
/api/health
```

## Security Notes

- Keep API keys and database credentials on the server.
- Do not commit `.env` files or expose secrets in client-side code.
- AI-generated transaction drafts and pricing recommendations should be reviewed before use.
- The current API does not authenticate users or enforce business ownership. Do not treat a business ID as proof of authorization.

