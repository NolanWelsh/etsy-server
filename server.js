const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ETSY_API_KEY = process.env.ETSY_API_KEY;
const ETSY_API_SECRET = process.env.ETSY_API_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

let accessToken = null;
let refreshToken = null;

// Start OAuth flow
app.get('/auth', (req, res) => {
  const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${CALLBACK_URL}&scope=listings_w%20listings_r&client_id=${ETSY_API_KEY}&state=superstate&code_challenge=DSWlW2WxJHikSi5pfaNAie-տնա7S78XX2eDQxm1yypQ&code_challenge_method=S256`;
  res.redirect(authUrl);
});

// OAuth callback
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenResponse = await axios.post('https://api.etsy.com/v3/public/oauth/token', {
      grant_type: 'authorization_code',
      client_id: ETSY_API_KEY,
      redirect_uri: CALLBACK_URL,
      code: code,
      code_verifier: 'DSWlW2WxJHikSi5pfaNAie-տնա7S78XX2eDQxm1yypQ'
    });
    
    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;
    
    res.send('✅ Authentication successful! You can close this window.');
  } catch (error) {
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

// Create draft listing from n8n
app.post('/create-listing', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });
  }

  try {
    const listingData = req.body;
    const shopId = listingData.shop_id;
    
    // Create draft listing
    const response = await axios.post(
      `https://openapi.etsy.com/v3/application/shops/${shopId}/listings`,
      listingData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': ETSY_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json({ success: true, listing: response.data });
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('Etsy Automation Server Running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
