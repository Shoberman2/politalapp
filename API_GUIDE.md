# Congress.gov API Integration Guide

## Why the API Was Failing

### Problem 1: Incorrect API Endpoint Structure
The Congress.gov API uses a different URL structure than what was initially coded:
- **Correct**: `/118/house` or `/118/senate` (congress number + chamber)
- **Wrong**: `/member/house/current.json`

### Problem 2: Response Data Structure
The API response has a different format:
- Members are in `response.data.members` (not `response.data.results[0].members`)
- Field names use camelCase: `bioguideId`, `firstName`, `lastName`, `partyName`
- Districts are strings like "01" not numbers

### Problem 3: Missing API Key
If you see errors, the most common cause is:
1. **No API key** - You need to register at https://api.congress.gov/sign-up/
2. **Wrong environment variable name** - Must be `VITE_CONGRESS_API_KEY`
3. **Server not restarted** - Restart `npm run dev` after adding the API key

## How to Get Your API Key

1. **Register**:
   - Go to https://api.congress.gov/sign-up/
   - Fill out the registration form
   - Provide your name and email
   - Agree to terms of service

2. **Receive Key**:
   - Check your email
   - You'll receive your API key within minutes
   - The key looks like: `abc123xyz456...` (40+ characters)

3. **Add to Project**:
   ```bash
   # Create .env file
   cp .env.example .env

   # Edit .env and add your key
   VITE_CONGRESS_API_KEY=your_actual_api_key_here
   ```

4. **Restart Server**:
   ```bash
   # Stop the server (Ctrl+C)
   # Start it again
   npm run dev
   ```

## Testing the API

### Test in Browser Console
Once logged in, open your browser console and check the network tab:
- Look for requests to `api.congress.gov`
- Status should be 200 (not 401 or 403)
- Response should have `members` array

### Test the Endpoints

The fixed API service uses these endpoints:

**Get House Members:**
```javascript
GET https://api.congress.gov/v3/118/house?currentMember=true&limit=250&api_key=YOUR_KEY
```

**Get Senate Members:**
```javascript
GET https://api.congress.gov/v3/118/senate?currentMember=true&limit=250&api_key=YOUR_KEY
```

**Get Member's Bills:**
```javascript
GET https://api.congress.gov/v3/member/BIOGUIDE_ID/sponsored-legislation?limit=20&api_key=YOUR_KEY
```

## Data Structure

### Member Object (Normalized)
```javascript
{
  bioguideId: "A000001",      // Unique ID
  name: "John Doe",           // Full name
  firstName: "John",
  lastName: "Doe",
  state: "CA",                // Two-letter state code
  district: "01",             // District number as string
  party: "Democrat",          // Full party name
  partyName: "Democrat",
  chamber: "house",           // "house" or "senate"
  url: "https://...",         // Official website
  updateDate: "2024-01-15"
}
```

### Bill Object
```javascript
{
  number: "H.R. 123",
  title: "Bill Title Here",
  latestAction: {
    text: "Referred to committee",
    actionDate: "2024-01-15"
  },
  type: "hr"  // hr, s, hjres, sjres
}
```

## Common API Errors

### 401 Unauthorized
**Error**: `Request failed with status code 401`

**Cause**: Missing or invalid API key

**Solution**:
1. Check your `.env` file exists
2. Verify the key starts with `VITE_CONGRESS_API_KEY=`
3. Copy the entire key (no extra spaces)
4. Restart the server

### 403 Forbidden
**Error**: `Request failed with status code 403`

**Cause**: API key is valid but request is blocked

**Solution**:
1. Check if you've exceeded rate limits (unlikely - no limits on free tier)
2. Verify the API key is still active
3. Contact Congress.gov if issue persists

### 404 Not Found
**Error**: `Request failed with status code 404`

**Cause**: Wrong endpoint URL

**Solution**:
- Check the code in `src/services/congress.js`
- Verify endpoints match: `/118/house`, `/118/senate`
- Congress number should be 118 (current congress as of 2024)

### Network Error
**Error**: `Network Error` or `ERR_CONNECTION_REFUSED`

**Cause**: No internet or DNS issues

**Solution**:
1. Check your internet connection
2. Try accessing https://api.congress.gov in browser
3. Disable VPN if using one
4. Check firewall settings

## How the State/District Lookup Works

1. **User Selects State**:
   - Dropdown shows all 50 US states
   - State abbreviation (e.g., "CA") is selected

2. **Load Districts**:
   - API call fetches all House members from that state
   - Extract unique district numbers
   - Show districts in dropdown (some states have 1, others have 50+)

3. **Find Representative**:
   - Filter members by state AND district
   - Return the matching representative
   - Display their profile and bills

## Debugging Tips

### Enable Console Logging
The `congress.js` file has `console.error()` statements. Check the browser console for:
```
Error fetching current members: [details here]
```

### Check Network Tab
In Chrome DevTools (F12):
1. Go to Network tab
2. Filter by "Fetch/XHR"
3. Look for `api.congress.gov` requests
4. Click to see Request/Response details

### Verify API Response
Add this temporary code to see raw responses:
```javascript
const response = await congressApi.get('/118/house')
console.log('Raw response:', response.data)
```

## Rate Limits

**Good News**: The official Congress.gov API has NO rate limits for reasonable use!

- No requests-per-minute limit
- No daily quota
- No paid tiers required
- Perfect for this application

## Production Deployment

When deploying to production (Vercel, Netlify, etc.):

1. **Add Environment Variable**:
   - In your hosting platform's dashboard
   - Add: `VITE_CONGRESS_API_KEY=your_key`
   - Rebuild the app

2. **Verify Build**:
   - Run `npm run build` locally first
   - Check for any errors
   - Test the built version with `npm run preview`

3. **Security Note**:
   - The API key will be visible in client-side code
   - This is OK - it's meant for client-side use
   - Congress.gov keys don't have sensitive access
   - For production, consider using a backend proxy

## Support

If you're still having issues:

1. **Check Browser Console**: Look for specific error messages
2. **Verify API Key**: Test it manually in browser at:
   ```
   https://api.congress.gov/v3/118/house?currentMember=true&api_key=YOUR_KEY
   ```
3. **Check Status**: Visit https://api.congress.gov for service status
4. **Review Code**: Compare `src/services/congress.js` with this guide

## Additional Resources

- **Official API Docs**: https://api.congress.gov/
- **Data Dictionary**: https://api.congress.gov/v3/#/
- **Support Email**: Check Congress.gov website for contact info
- **GitHub Issues**: Report bugs at your project repository

---

The API is now properly integrated and should work seamlessly once you add your API key!
