# Ledger

Ledger is an AI-assisted finance tracker and pricing calculator for small
businesses. Its React and Vite frontend uses the Express API for business
profiles, transactions, financial summaries, pricing estimates, and local
AI-assisted transaction drafts. The backend connects to MongoDB Atlas with
Mongoose.

## Requirements

- Node.js 20.19 or newer, or 22.12 or newer
- npm 10 or newer

## Installation

Install the frontend and backend dependencies from the repository root:

```sh
npm install
```

Copy the backend environment template to a local environment file:

```sh
cp server/.env.example server/.env
```

On Windows PowerShell, use:

```powershell
Copy-Item server/.env.example server/.env
```

The example file contains placeholder values only. Edit `server/.env` locally
and replace `MONGODB_URI` with the connection string from your Atlas cluster and
`GROQ_API_KEY` with a key from your Groq account (https://console.groq.com) (`AI_MODEL` defaults
to `llama-3.3-70b-versatile`).
Do not paste it into chat, commit `.env` files, or put secrets in frontend
environment variables.

## Development

Run the Vite frontend and Express backend together:

```sh
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend health endpoint: <http://localhost:5000/api/health>

The backend validates its environment and connects to MongoDB before it starts
accepting HTTP requests. The Vite development server proxies `/api` requests to
the backend. The Express server also enables CORS for the origin configured by
`CLIENT_ORIGIN` (defaults to `http://localhost:5173`).

On Windows, if Node.js reports only loopback DNS servers while Windows has
configured network DNS servers, the backend uses those Windows-configured
servers for Node DNS lookups before connecting. It does not hardcode a public
DNS provider.

To run one service independently:

```sh
npm run dev --workspace=client
npm run dev --workspace=server
```

## Frontend

The `client/` workspace is a React and TypeScript app built with Vite and
Tailwind CSS. Its typed API client calls the real backend through Vite's `/api`
development proxy. No frontend environment variable is needed for local
development.

The interface includes:

- **Overview:** business-specific income, expenses, net balance, counts, and
  recent transactions from the summary and transaction APIs.
- **Businesses:** create a profile and switch between existing businesses.
- **Transactions:** list, search, filter, create, edit, and delete records.
- **Price Calculator:** calculate markup-based estimates through
  `POST /api/pricing/calculate`, request optional AI guidance through
  `POST /api/pricing/recommend`, and explicitly save reviewed product or
  service prices to the selected business. **Saved Prices** lists and manages
  those records.
- **AI entry:** request drafts from a Groq-hosted open-weight model, edit each field,
  and explicitly confirm each transaction before it is submitted. Missing
  amounts and dates are shown as uncertain; an amount and date must be supplied
  before saving.

The dashboard does not invent placeholder financial values. Create/select a
business to load real API data. AI features require a valid `GROQ_API_KEY`;
unavailable inference is shown as an API error, not
replaced with sample output.

## Type checking and build

Run strict TypeScript checks for both the client and server:

```sh
npm run typecheck
```

Build the frontend assets and compile the backend:

```sh
npm run build
```

The frontend build is written to `client/dist/`; the compiled backend is written
to `server/dist/`. Start the compiled backend with:

```sh
npm start --workspace=server
```

The server's focused AI parsing tests can be run with:

```sh
npm run test --workspace=server
```

For a basic API smoke check while the backend is running:

```sh
curl http://localhost:5000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "application": "ok",
  "database": "connected"
}
```

If MongoDB is disconnected, the health endpoint returns HTTP `503` and reports
`"status": "unhealthy"` with the database state. It never returns the connection
string or other connection details.

## Business profiles API

The API stores business profiles in MongoDB. Every success response uses
`{"success":true,"data":...}`; errors use
`{"success":false,"error":{"code":"...","message":"..."}}` and may include
validation `details`. Unknown request fields are rejected.

| Method | Endpoint | Result |
| --- | --- | --- |
| `GET` | `/api/businesses` | List businesses |
| `POST` | `/api/businesses` | Create a business (HTTP `201`) |
| `GET` | `/api/businesses/:id` | Get one business |
| `PATCH` or `PUT` | `/api/businesses/:id` | Update supplied fields |
| `DELETE` | `/api/businesses/:id` | Delete a business |

`name` is required when creating a business. `industry` and `description` are
optional; `currency` defaults to `NGN`. Updates require at least one supported
field. Invalid bodies or IDs return HTTP `400`; valid IDs for missing records
return HTTP `404`.

With the server running and MongoDB connected, use these commands in Windows
PowerShell. `ConvertTo-Json` generates valid JSON, and `Invoke-RestMethod`
passes it as the request body without the extra native-executable quoting layer
that can cause `curl.exe --data-raw $body` to strip JSON key quotes in some
PowerShell versions. Run the commands in order:

```powershell
$baseUrl = 'http://localhost:5000'
$createBody = @{
  name = 'Acme Foods'
  industry = 'Food'
  description = 'Local producer'
} | ConvertTo-Json -Compress

# Create (HTTP 201). Save the returned data._id for the remaining commands.
$created = Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/businesses" `
  -ContentType 'application/json' `
  -Body $createBody
$created
$businessId = $created.data._id

# List, fetch, and update (PATCH changes only the supplied field).
Invoke-RestMethod -Method Get -Uri "$baseUrl/api/businesses"
Invoke-RestMethod -Method Get -Uri "$baseUrl/api/businesses/$businessId"

$updateBody = @{ currency = 'USD' } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Patch `
  -Uri "$baseUrl/api/businesses/$businessId" `
  -ContentType 'application/json' `
  -Body $updateBody

# Unknown fields are rejected with HTTP 400 and a VALIDATION_ERROR response.
$invalidBody = @{
  name = 'Invalid example'
  extra = 'rejected'
} | ConvertTo-Json -Compress
try {
  Invoke-RestMethod -Method Post `
    -Uri "$baseUrl/api/businesses" `
    -ContentType 'application/json' `
    -Body $invalidBody
} catch {
  "Expected validation response: HTTP $([int]$_.Exception.Response.StatusCode)"
}

# Delete (then a GET by this ID returns HTTP 404).
Invoke-RestMethod -Method Delete -Uri "$baseUrl/api/businesses/$businessId"
try {
  Invoke-RestMethod -Method Get -Uri "$baseUrl/api/businesses/$businessId"
} catch {
  "Expected missing-record response: HTTP $([int]$_.Exception.Response.StatusCode)"
}
```

## Financial dashboard summary API

`GET /api/businesses/:businessId/summary` returns transaction totals for one
existing business, calculated in MongoDB using an aggregation pipeline:

```json
{
  "success": true,
  "data": {
    "totalIncome": 1000,
    "totalExpenses": 250,
    "netBalance": 750,
    "incomeCount": 1,
    "expenseCount": 1,
    "transactionCount": 2
  }
}
```

Businesses without transactions receive zero for every amount and count. An
invalid business ID returns HTTP `400`; a valid ID without a matching business
returns HTTP `404`.

The following PowerShell test creates one business with income and expenses
and another with no transactions, requests both summaries, checks invalid and
nonexistent business IDs, and deletes the temporary businesses:

```powershell
$baseUrl = 'http://localhost:5000'
$incomeBusiness = Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/businesses" `
  -ContentType 'application/json' `
  -Body (@{ name = 'Summary test with transactions' } | ConvertTo-Json -Compress)
$emptyBusiness = Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/businesses" `
  -ContentType 'application/json' `
  -Body (@{ name = 'Summary test without transactions' } | ConvertTo-Json -Compress)

$incomeBusinessId = $incomeBusiness.data._id
$emptyBusinessId = $emptyBusiness.data._id
$incomeTransactionId = $null
$expenseTransactionId = $null
try {
  $income = @{ type = 'income'; description = 'Test sale'; amount = 1000 } |
    ConvertTo-Json -Compress
  $expense = @{ type = 'expense'; description = 'Test cost'; amount = 250 } |
    ConvertTo-Json -Compress

  $incomeTransaction = Invoke-RestMethod -Method Post `
    -Uri "$baseUrl/api/businesses/$incomeBusinessId/transactions" `
    -ContentType 'application/json' -Body $income
  $incomeTransactionId = $incomeTransaction.data._id
  $expenseTransaction = Invoke-RestMethod -Method Post `
    -Uri "$baseUrl/api/businesses/$incomeBusinessId/transactions" `
    -ContentType 'application/json' -Body $expense
  $expenseTransactionId = $expenseTransaction.data._id

  # Expected: income 1000, expenses 250, balance 750, counts 1/1/2.
  Invoke-RestMethod -Method Get `
    -Uri "$baseUrl/api/businesses/$incomeBusinessId/summary"

  # Expected: all totals and counts are zero.
  Invoke-RestMethod -Method Get `
    -Uri "$baseUrl/api/businesses/$emptyBusinessId/summary"

  # Invalid ID -> HTTP 400; valid but nonexistent ObjectId -> HTTP 404.
  foreach ($id in @('not-an-id', '000000000000000000000000')) {
    try {
      Invoke-RestMethod -Method Get `
        -Uri "$baseUrl/api/businesses/$id/summary"
    } catch {
      "Expected summary error for '$id': HTTP $([int]$_.Exception.Response.StatusCode)"
    }
  }
} finally {
  if ($incomeTransactionId) {
    Invoke-RestMethod -Method Delete `
      -Uri "$baseUrl/api/transactions/$incomeTransactionId"
  }
  if ($expenseTransactionId) {
    Invoke-RestMethod -Method Delete `
      -Uri "$baseUrl/api/transactions/$expenseTransactionId"
  }
  Invoke-RestMethod -Method Delete `
    -Uri "$baseUrl/api/businesses/$incomeBusinessId"
  Invoke-RestMethod -Method Delete `
    -Uri "$baseUrl/api/businesses/$emptyBusinessId"
}
```

## Markup-based pricing calculator API

`POST /api/pricing/calculate` is a deterministic, stateless markup-based
calculator. `markupPercent` is applied to total unit cost; it is **not** a
profit-margin percentage. The endpoint does not use MongoDB or AI and does not
save the calculation.

Required inputs are `unitCost` and `markupPercent`, both non-negative numbers.
`additionalCosts` defaults to `0` and must be non-negative when supplied.
`quantity` defaults to `1` and must be a positive integer. Unknown fields and
invalid values return HTTP `400` with the standard validation error envelope.
Monetary outputs are rounded to two decimal places; values too large for safe
cent precision are rejected. Existing response fields (`totalUnitCost`,
`sellingPricePerUnit`, `profitPerUnit`, `totalRevenue`, and `totalProfit`) are
preserved. Additional results distinguish the input markup from the calculated
gross profit margin. Gross profit uses only the supplied per-unit costs; it is
not net profit and does not include fixed overhead. The legacy
`profitPerUnit` field remains and matches the new `grossProfitPerUnit` field.

Optional `targetMarginPercent` must be from 0 up to (but not including) 100 and
requires positive total unit cost. The target price uses
`totalUnitCost / (1 - targetMarginPercent / 100)` and is rounded to cents; the
response includes the realized margin after rounding. Optional
`alternativePrices` is an array of up to five non-negative selling prices.
Each alternative returns gross profit per unit, projected gross profit for
`quantity`, and gross margin. A zero selling price has an unavailable margin.
No break-even estimate is calculated because no fixed costs are collected.

### AI pricing assistance

`POST /api/pricing/recommend` accepts the same deterministic calculation
inputs, wrapped in `calculation`, and optional product/business context in
`context`. It uses the open-weight model (via Groq) configured by `AI_MODEL`; the setup is the same
as for [AI-assisted transaction entry](#ai-assisted-transaction-entry). A
provider connection or HTTP failure returns HTTP `503`
(`AI_PROVIDER_UNAVAILABLE`); an inference request that exceeds
`AI_PRICING_TIMEOUT_MS` returns HTTP `504` (`AI_PROVIDER_TIMEOUT`); invalid or
unsupported model output returns HTTP `502` (`INVALID_AI_OUTPUT`).

The pricing recommendation timeout defaults to 180 seconds. Configure
`AI_PRICING_TIMEOUT_MS` in `server/.env` as a positive integer from 1 through
600000 milliseconds; for example, `AI_PRICING_TIMEOUT_MS=180000`. This setting
only applies to AI pricing recommendations. Transaction-entry AI retains its
separate existing timeout.

The recommendation proposes a suggested price, range, explanation, assumptions,
missing information, qualitative trade-offs, and optionally three ordered
scenarios. Candidate prices are checked against total unit cost and any target
margin, then every gross-profit and margin figure is recalculated using the
deterministic pricing service and requested quantity. Model prose is restricted
to qualitative text so unverified financial figures are not displayed. User
market evidence is passed as context but is not independently verified. This
endpoint does not itself save a price; the user must explicitly choose **Save
Price** after reviewing the result.

Example PowerShell request:

```powershell
$recommendationBody = @{
  calculation = @{
    unitCost = 10
    additionalCosts = 2
    markupPercent = 25
    quantity = 3
    targetMarginPercent = 20
  }
  context = @{
    currency = 'USD'
    businessType = 'Handmade goods'
    productDescription = 'Handmade ceramic mug'
    intendedCustomer = 'Gift buyers'
    pricingGoal = 'Balance accessibility with gross profit'
    marketEvidence = 'A few local listings appeared to be in a similar range'
  }
} | ConvertTo-Json -Depth 5 -Compress
Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/pricing/recommend" `
  -ContentType 'application/json' `
  -Body $recommendationBody
```

### Saved pricing records

The Price Calculator can save a reviewed selling price as a business-scoped
pricing record. Records are stored separately from financial transactions and
are not included in income or expense totals. Prices are stored with their
currency code; Ledger does not convert currencies.

| Method | Endpoint | Result |
| --- | --- | --- |
| `POST` | `/api/businesses/:businessId/pricing-records` | Save a standard or AI-assisted price (HTTP `201`) |
| `GET` | `/api/businesses/:businessId/pricing-records` | List saved pricing records for a business |
| `PATCH` | `/api/businesses/:businessId/pricing-records/:pricingRecordId` | Update supplied fields of a saved price |
| `DELETE` | `/api/businesses/:businessId/pricing-records/:pricingRecordId` | Delete one saved price |

The request body requires a trimmed non-empty `name`, `type` (`product` or
`service`), `currency`, `calculationMethod` (`standard` or `ai`), calculation
inputs, and a UUID `idempotencyKey`. Standard prices are recalculated on the
server using the existing pricing formula. AI saves additionally require the
selected `sellingPricePerUnit` and validated `recommendationMetadata`; the
server checks that the price is within the recommendation range and covers
costs. Reusing an idempotency key with the same payload returns the saved
record; reusing it for different data returns HTTP `409`.

Only NGN, USD, GBP, or the selected business's configured currency is accepted.
The selected business must exist. A result must be recalculated after changing
its name, type, currency, costs, markup, quantity, or AI context before it can
be saved.
Saved Prices supports name/type/currency and stored-amount edits through
`PATCH`; these update the existing record and timestamp but do not run the
calculator. Reusing a record in the calculator prefills the saved inputs only;
the user must calculate a fresh result before saving another record. Deletion
is scoped by both business ID and pricing-record ID and never changes
transactions.

**Authorization limitation:** the current application does not authenticate
users or track business ownership. These routes follow the existing
business-scoped API convention and verify that the business exists, but a
business ID is not proof of ownership. Do not expose this API publicly until
an ownership/authorization layer is added.

Example PowerShell requests:

```powershell
$baseUrl = 'http://localhost:5000'

# Valid input with quantity greater than one:
# total unit cost 12, price/unit 15, profit/unit 3,
# total revenue 45, total profit 9.
$validBody = @{
  unitCost = 10
  additionalCosts = 2
  markupPercent = 25
  quantity = 3
  targetMarginPercent = 30
  alternativePrices = @(14, 16, 18)
} | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/pricing/calculate" `
  -ContentType 'application/json' `
  -Body $validBody

# Zero costs are valid; all returned monetary values are 0.
$zeroBody = @{
  unitCost = 0
  markupPercent = 50
} | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/pricing/calculate" `
  -ContentType 'application/json' `
  -Body $zeroBody

# Negative costs are rejected with HTTP 400.
$invalidBody = @{
  unitCost = -1
  markupPercent = 25
} | ConvertTo-Json -Compress
try {
  Invoke-RestMethod -Method Post `
    -Uri "$baseUrl/api/pricing/calculate" `
    -ContentType 'application/json' `
    -Body $invalidBody
} catch {
  "Expected validation response: HTTP $([int]$_.Exception.Response.StatusCode)"
}

# A 100% target margin is invalid; target margins must be below 100%.
$invalidMarginBody = @{
  unitCost = 10
  markupPercent = 25
  targetMarginPercent = 100
} | ConvertTo-Json -Compress
try {
  Invoke-RestMethod -Method Post `
    -Uri "$baseUrl/api/pricing/calculate" `
    -ContentType 'application/json' `
    -Body $invalidMarginBody
} catch {
  "Expected validation response: HTTP $([int]$_.Exception.Response.StatusCode)"
}
```

## Transactions API

Transactions belong to a business. Create the business first, then use its
returned `_id` when creating or listing transactions. Success and error
responses use the same JSON envelope as the Business API. Transaction
create/update requests reject unknown fields, including `_id`, `businessId`,
and timestamps. `type` must be `income` or `expense`; `amount` must be a
positive number; and `date`, when supplied, must be an ISO date or
date-time string. If omitted on creation, the date defaults to now.

| Method | Endpoint | Result |
| --- | --- | --- |
| `POST` | `/api/businesses/:businessId/transactions` | Create a transaction (HTTP `201`) |
| `GET` | `/api/businesses/:businessId/transactions` | List transactions for a business |
| `GET` | `/api/transactions/:id` | Get one transaction |
| `PATCH` | `/api/transactions/:id` | Update supplied transaction fields |
| `DELETE` | `/api/transactions/:id` | Delete a transaction |

Malformed IDs or bodies return HTTP `400`; a missing business or transaction
returns HTTP `404`; unexpected database failures return HTTP `500` without
internal details.

With the server and MongoDB running, run these Windows PowerShell commands in
order. They create a temporary business and transaction, exercise each
endpoint, then delete both records:

```powershell
$baseUrl = 'http://localhost:5000'
$businessBody = @{ name = 'Ledger API test business' } | ConvertTo-Json -Compress
$business = Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/businesses" `
  -ContentType 'application/json' `
  -Body $businessBody
$businessId = $business.data._id

$transactionBody = @{
  type = 'income'
  description = 'Test invoice payment'
  amount = 1250.50
  category = 'Sales'
  date = '2026-10-16'
} | ConvertTo-Json -Compress
$created = Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/businesses/$businessId/transactions" `
  -ContentType 'application/json' `
  -Body $transactionBody
$transactionId = $created.data._id

# List transactions for the business and fetch this transaction.
Invoke-RestMethod -Method Get `
  -Uri "$baseUrl/api/businesses/$businessId/transactions"
Invoke-RestMethod -Method Get -Uri "$baseUrl/api/transactions/$transactionId"

# Update the transaction; only supplied fields are changed.
$updateBody = @{
  type = 'expense'
  description = 'Test supplier payment'
} | ConvertTo-Json -Compress
Invoke-RestMethod -Method Patch `
  -Uri "$baseUrl/api/transactions/$transactionId" `
  -ContentType 'application/json' `
  -Body $updateBody

# Delete the transaction and then its test business.
Invoke-RestMethod -Method Delete -Uri "$baseUrl/api/transactions/$transactionId"
Invoke-RestMethod -Method Delete -Uri "$baseUrl/api/businesses/$businessId"
```

## AI-assisted transaction entry

`POST /api/ai/parse-transactions` uses Groq-hosted open-weight models and the
configured model to return transaction drafts for review. It does not
create or save transactions; after reviewing and completing any uncertain
fields, submit confirmed data through the existing
`POST /api/businesses/:businessId/transactions` endpoint.

The request must include an existing `businessId` and natural-language `text`
of at most 2000 characters. The response includes `drafts`,
`uncertainties`, and `requiresReview: true`. Amounts and dates are checked
against short verbatim evidence from the input. An amount must be a clear
numeric total; dates are normalized only from an explicit ISO date or the
unambiguous relative words `today` and `yesterday` (anchored to the server's
UTC date). Unsupported, missing, or ambiguous values are returned as `null`
with an uncertainty instead of being invented.

Set `GROQ_API_KEY` (required) and optionally `AI_MODEL` (default
`llama-3.3-70b-versatile`) in `server/.env`. The text of each request is sent to Groq, so
avoid entering data you do not want shared with that provider. Keep the key
server-side only. AI pricing recommendations use `AI_PRICING_TIMEOUT_MS` (default 180000 milliseconds), while transaction parsing retains its existing
separate timeout.

Example PowerShell request (use a business you created with the Business API):

```powershell
$baseUrl = 'http://localhost:5000'
$businessId = 'replace-with-an-existing-business-id'
$requestBody = @{
  businessId = $businessId
  text = 'Received 5000 from a customer today for a cake order.'
} | ConvertTo-Json -Compress
$drafts = Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/ai/parse-transactions" `
  -ContentType 'application/json' `
  -Body $requestBody
$drafts.data
```

An ambiguous example that should report unresolved fields rather than guess:

```powershell
$ambiguousBody = @{
  businessId = $businessId
  text = 'Paid a supplier for inventory, but I did not record the amount or date.'
} | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post `
  -Uri "$baseUrl/api/ai/parse-transactions" `
  -ContentType 'application/json' `
  -Body $ambiguousBody
```

Malformed model JSON or schema output returns HTTP `502` with
`INVALID_AI_OUTPUT`. A Groq failure (invalid key, quota, network) returns
HTTP `503` with `AI_PROVIDER_UNAVAILABLE` without exposing provider details.
The focused tests use a fake chat client to exercise valid and malformed
provider output, ambiguous fields, and unavailable-provider handling:

```powershell
npm run test --workspace=server
```

## Deploying to Render

Ledger deploys as a single Render Web Service: the Express server also serves
the built React app (`client/dist`) and falls back to `index.html` for non-API
routes. The included `render.yaml` Blueprint configures it (Node 22, build
`npm ci --include=dev && npm run build`, start `npm start --workspace=server`,
health check `/api/health`). `--include=dev` is required because Render sets
`NODE_ENV=production`, which would otherwise skip `typescript` and `vite`.

1. Push the repository to GitHub, then in Render choose **New → Blueprint** and
   select it.
2. Set the secret environment variables when prompted (they are `sync: false` and never stored in the repo):
   - `MONGODB_URI`: your Atlas connection string.
   - `GROQ_API_KEY`: your Groq API key.
   - `CLIENT_ORIGIN`: the service's public URL, e.g.
     `https://ledger.onrender.com` (used for CORS).
   - `AI_MODEL` is optional and defaults to `llama-3.3-70b-versatile`.
3. In Atlas **Network Access**, allow Render to connect. Render web services
   use shared outbound IP ranges (listed under the service's **Connect →
   Outbound** tab); add those, or use `0.0.0.0/0` only if you accept that risk
   and rely on strong database credentials.
4. Render calls `/api/health` and marks the deploy healthy once it returns
   HTTP 200, which requires the database to be connected. If it stays
   unhealthy, check Atlas network access and `MONGODB_URI` in the logs.

## MongoDB Atlas

1. In Atlas, create a **database user** with a strong password and the minimum
   database permissions needed. This is separate from your Atlas website login.
2. Under **Network Access**, add the public IP address of the development
   machine running Ledger. Atlas blocks unlisted addresses by default. Do not
   use `0.0.0.0/0` as the default; for deployment, allow only the application's
   known outbound IPs or use an appropriate private network configuration.
3. In Atlas, choose **Connect â†’ Drivers** and copy the Node.js connection
   string. Replace its username, password, and database name as instructed by
   Atlas. Percent-encode reserved characters in the username or password.
4. Put the complete URI in `server/.env` as `MONGODB_URI`. Keep it server-side;
   never add it to a `VITE_` variable, frontend source, logs, or API responses.
5. Run `npm run dev --workspace=server`. The server validates the settings and
   waits for MongoDB before it starts listening. The health endpoint reports
   whether the database is connected.

The business profile model stores `createdAt` and `updatedAt` timestamps.

### Troubleshooting Atlas connections

- **Authentication failure:** Confirm `MONGODB_URI` uses the Atlas **database
  user's** credentials, not your Atlas account login. Check that the username
  and password are current and percent-encode reserved characters such as
  `@`, `:`, `/`, or `#`. Do not print the URI while debugging.
- **DNS/SRV errors:** Verify the cluster hostname copied from Atlas and that
  the current DNS resolver can resolve MongoDB SRV records. VPNs, firewalls,
  and some local DNS resolvers can block SRV lookups; check the machine's DNS
  and network configuration rather than assuming the cluster or credentials
  are wrong. On Windows, Ledger uses configured adapter DNS servers if Node.js
  reports only loopback DNS servers.
- **Server-selection timeouts:** Confirm the cluster is running and the
  development machine's current public IP is in Atlas **Network Access**.
  Check that outbound TCP port `27017` is allowed and that the URI points to
  the correct cluster. Newly added network rules can take time to take effect.
  Do not work around this by disabling authentication or allowing every IP.
