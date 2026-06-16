# Deploy Kaspa Radar

## Static Frontend
Deploy the root folder to:
- Cloudflare Pages
- GitHub Pages
- Netlify
- Vercel

No build step required.

## Optional Backend Proxy
Deploy `/server` to:
- Render
- Railway
- Fly.io
- VPS
- Cloudflare Workers adaptation

Local run:

```bash
cd server
npm install
npm start
```

Set frontend Settings → API Server URL to your deployed backend URL.

## Production Notes
- Add authentication before exposing real admin features.
- Use a backend for rate-limit protection.
- Add API keys only server-side.
- Replace placeholder values with verified sources.
