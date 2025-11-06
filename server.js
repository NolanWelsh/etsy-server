const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ETSY_API_KEY = process.env.ETSY_API_KEY;
const ETSY_API_SECRET = process.env.ETSY_API_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

// Generate consistent code verifier and challenge
const CODE_VERIFIER = 'DSWlW2WxJHikSi5pfaNAie-tna7S78XX2eDQxm1yypQ'; // Use only ASCII characters
const CODE_CHALLENGE = crypto.createHash('sha256').update(CODE_VERIFIER).digest('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

let accessToken = null;
let refreshToken = null;

// Start OAuth flow
app.get('/auth', (req, res) => {
  const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=listings_w%20listings_r&client_id=${ETSY_API_KEY}&state=superstate&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256`;
  console.log('Auth URL:', authUrl);
  console.log('Code Challenge:', CODE_CHALLENGE);
  res.redirect(authUrl);
});

// OAuth callback
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  console.log('Received code:', code);
  console.log('Using verifier:', CODE_VERIFIER);
  
  try {
    const tokenResponse = await axios.post('https://api.etsy.com/v3/public/oauth/token', {
      grant_type: 'authorization_code',
      client_id: ETSY_API_KEY,
      redirect_uri: CALLBACK_URL,
      code: code,
      code_verifier: CODE_VERIFIER
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;
    
    console.log('✅ Authentication successful!');
    res.send('✅ Authentication successful! You can close this window.');
  } catch (error) {
    console.error('Authentication error:', error.response?.data || error.message);
    res.status(500).send('Authentication failed: ' + JSON.stringify(error.response?.data || error.message));
  }
});

// Create draft listing from n8n
app.post('/create-listing', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });
  }

  try {
    const listingData = req.body;
    
    // Ensure numeric fields are numbers, not strings
    const cleanData = {
      ...listingData,
      shop_id: parseInt(listingData.shop_id),
      taxonomy_id: parseInt(listingData.taxonomy_id),
      shipping_profile_id: parseInt(listingData.shipping_profile_id),
      quantity: parseInt(listingData.quantity),
      processing_min: parseInt(listingData.processing_min),
      processing_max: parseInt(listingData.processing_max),
      production_partner_ids: listingData.production_partner_ids.map(id => parseInt(id))
    };
    
    console.log('Sending to Etsy:', JSON.stringify(cleanData, null, 2));
    
    const shopId = cleanData.shop_id;
    
    const response = await axios.post(
      `https://openapi.etsy.com/v3/application/shops/${shopId}/listings`,
      cleanData,
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
    console.error('Listing creation error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('Etsy Server Running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
