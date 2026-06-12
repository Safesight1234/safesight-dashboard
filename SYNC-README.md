# Teamleader Sync Setup

## Quick Start

1. **Get Teamleader Refresh Token**
   - Go to: `https://safesightnumbers.netlify.app/.netlify/functions/auth-connect`
   - Log in and authorize
   - Copy the refresh token displayed

2. **Add to Netlify Environment**
   - Go to Netlify → Site settings → Environment
   - Add: `TL_REFRESH_TOKEN` = [paste the token]
   - Make sure `TL_CLIENT_ID` and `TL_CLIENT_SECRET` are set
   - Deploy

3. **Test Sync**
   - Click "Sync Teamleader" button on dashboard
   - It will fetch all deals and contracts from Teamleader
   - Dashboard updates automatically

## Local Testing

```bash
# Set environment variables
export TL_CLIENT_ID="your_id"
export TL_CLIENT_SECRET="your_secret"
export TL_REFRESH_TOKEN="your_token"
export TL_PIPELINE_1="pipeline_id_1"
export TL_PIPELINE_2="pipeline_id_2"

# Run sync
node sync-teamleader.js
```

This creates `project/dashboard/data.json` with all the data.

## Files

- `sync-teamleader.js` - Simple sync script (can run locally or as Netlify function)
- `project/dashboard/data.json` - Output data file (dashboard reads this)
- `project/dashboard/index.html` - Dashboard (reads from data.json)

## How It Works

1. Script gets access token using refresh token
2. Fetches all deals from Teamleader pipelines
3. Fetches all companies and extracts contract end dates
4. Saves everything to data.json
5. Dashboard displays the data

Done!
