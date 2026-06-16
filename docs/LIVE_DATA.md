# Live Data Integration

Kaspa Radar Final Live Data connects four data groups through the optional backend proxy.

## 1. CoinGecko
Endpoint used by server:

```text
/api/prices?ids=kaspa
```

Used for:
- USD price
- market cap
- 24h volume
- 24h change
- last updated timestamp

## 2. GitHub
Endpoint used by server:

```text
/api/github?repos=kaspanet/rusty-kaspa,kaspanet/kaspad
```

Used for:
- stars
- forks
- open issues
- latest push
- latest release

## 3. DefiLlama
Endpoints used by server:

```text
/api/defillama/protocol/kaskad
/api/defillama/protocols
```

Used for:
- TVL
- chain data
- protocol metadata

## 4. Kaspa Network
Endpoints used by server:

```text
/api/kaspa/network
/api/kaspa/hashrate
```

Used for future:
- network stats
- hashrate
- difficulty/network indicators

## Run server

```bash
cd server
npm install
npm start
```

Then in the app:
- Settings → API Server URL = `http://localhost:8787`
- Dashboard → Fetch All Live Data

## Notes

Some small Kaspa ecosystem projects may not have public APIs yet.
For those, use the Admin Panel manual fields until a reliable source exists.
