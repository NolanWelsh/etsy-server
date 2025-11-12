const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const app = express();
app.use(express.json({ limit: '40mb' }));
app.use(express.urlencoded({ extended: true, limit: '40mb' }));

const PORT = process.env.PORT || 3000;
const ETSY_API_KEY = process.env.ETSY_API_KEY;
const ETSY_API_SECRET = process.env.ETSY_API_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

// Generate consistent code verifier and challenge
const CODE_VERIFIER = 'DSWlW2WxJHikSi5pfaNAie-tna7S78XX2eDQxm1yypQ';
const CODE_CHALLENGE = crypto.createHash('sha256').update(CODE_VERIFIER).digest('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

let accessToken = null;
let refreshToken = null;

async function downloadImage(url) {
  // If it's a Google Drive link, add confirmation bypass
  if (url.includes('drive.google.com')) {
    url = url.replace('/uc?id=', '/uc?export=download&confirm=1&id=');
  }
  
  const response = await axios.get(url, { 
    responseType: 'arraybuffer',
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  });
  return Buffer.from(response.data);
}
}

// Start OAuth flow
app.get('/auth', (req, res) => {
  const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=listings_w%20listings_r%20shops_r&client_id=${ETSY_API_KEY}&state=superstate&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256`;
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
    
    const cleanData = {
      ...listingData,
      shop_id: parseInt(listingData.shop_id),
      taxonomy_id: parseInt(listingData.taxonomy_id),
      shipping_profile_id: parseInt(listingData.shipping_profile_id),
      quantity: parseInt(listingData.quantity),
      processing_min: parseInt(listingData.processing_min),
      processing_max: parseInt(listingData.processing_max)
    };
    
    if (listingData.production_partner_ids) {
      cleanData.production_partner_ids = listingData.production_partner_ids.map(id => parseInt(id));
    }
    
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

// Get shipping profiles
app.get('/get-shipping-profiles', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });
  }

  try {
    const shopId = 56086091;
    
    const response = await axios.get(
      `https://openapi.etsy.com/v3/application/shops/${shopId}/shipping-profiles`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': ETSY_API_KEY
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Get production partners
app.get('/get-production-partners', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });
  }

  try {
    const shopId = 56086091;
    
    const response = await axios.get(
      `https://openapi.etsy.com/v3/application/shops/${shopId}/production-partners`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': ETSY_API_KEY
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Get listing details
app.get('/get-listing/:listing_id', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });
  }

  try {
    const listingId = req.params.listing_id;
    
    const response = await axios.get(
      `https://openapi.etsy.com/v3/application/listings/${listingId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': ETSY_API_KEY
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Update inventory for a listing
app.post('/update-inventory', async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });

  try {
    const {
      listing_id,
      products,
      price_on_property,
      quantity_on_property,
      sku_on_property
    } = req.body;

    console.log('Incoming body:', JSON.stringify(req.body, null, 2));

    if (!listing_id || !Array.isArray(products)) {
      return res.status(400).json({ error: 'listing_id and products[] are required' });
    }

    const payload = {
      products,
      price_on_property: price_on_property ?? [513, 514],
      quantity_on_property: quantity_on_property ?? [],
      sku_on_property: sku_on_property ?? []
    };

    console.log('Sending inventory update to Etsy for listing:', listing_id);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const r = await axios.put(
      `https://openapi.etsy.com/v3/application/listings/${listing_id}/inventory`,
      payload,
      { 
        headers: { 
          Authorization: `Bearer ${accessToken}`, 
          'x-api-key': ETSY_API_KEY, 
          'Content-Type': 'application/json' 
        } 
      }
    );

    res.json({ success: true, inventory: r.data });
  } catch (error) {
    console.error('Inventory update error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ error: error.response?.data || error.message });
  }
});

app.post('/upload-image', upload.single('image'), async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });
  }

  try {
    const listing_id = req.body.listing_id || req.query.listing_id;
    
    if (!listing_id || !req.file) {
      return res.status(400).json({ error: 'listing_id and image file required' });
    }

    const form = new FormData();
    form.append('image', req.file.buffer, { 
      filename: req.file.originalname, 
      contentType: req.file.mimetype 
    });

    const r = await axios.post(
      `https://openapi.etsy.com/v3/application/listings/${listing_id}/images`,
      form,
      { 
        headers: { 
          ...form.getHeaders(), 
          Authorization: `Bearer ${accessToken}`, 
          'x-api-key': ETSY_API_KEY 
        } 
      }
    );
    
    res.json({ success: true, image: r.data });
  } catch (e) {
    console.error('Image upload error:', e.message);
    res.status(e.response?.status || 500).json({ error: e.message });
  }
});

// Upload a listing video
app.post('/upload-video', upload.single('video'), async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });
  }

  try {
    const { listing_id } = fields(req);
    if (!listing_id || !req.file) {
      return res.status(400).json({ error: 'listing_id and video required' });
    }

    const imageUrl = req.query.image_url || req.body.image_url;
const imageBuffer = await downloadImage(imageUrl);

const form = new FormData();
form.append('image', imageBuffer, { 
  filename: 'mockup.jpg', 
  contentType: 'image/jpeg' 
});

    const r = await axios.post(
      `https://openapi.etsy.com/v3/application/listings/${listing_id}/videos`,
      form,
      { 
        headers: { 
          ...form.getHeaders(), 
          Authorization: `Bearer ${accessToken}`, 
          'x-api-key': ETSY_API_KEY 
        } 
      }
    );
    
    res.json({ success: true, video: r.data });
  } catch (e) {
    console.error('Video upload error:', e.response?.data || e.message);
    res.status(e.response?.status || 500).json({ error: e.response?.data || e.message });
  }
});

// Get Size + Print Type property IDs and current inventory state
app.get('/get-size-property-id/:listingId', async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Visit /auth first.' });
  }

  try {
    const { listingId } = req.params;

    const listingResponse = await axios.get(
      `https://openapi.etsy.com/v3/application/listings/${listingId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': ETSY_API_KEY
        }
      }
    );

    const listingData = listingResponse.data;
    const taxonomyId = listingData.taxonomy_id;

    const propertiesResponse = await axios.get(
      `https://openapi.etsy.com/v3/application/buyer-taxonomy/nodes/${taxonomyId}/properties`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': ETSY_API_KEY
        }
      }
    );

    const propertiesData = propertiesResponse.data;

    let sizePropertyId = null;
    let printTypePropertyId = null;

    if (propertiesData.properties) {
      for (const p of propertiesData.properties) {
        if (p.name && p.name.toLowerCase() === 'size') {
          sizePropertyId = p.property_id;
        }
        if (p.name && p.name.toLowerCase() === 'print type') {
          printTypePropertyId = p.property_id;
        }
      }
    }

    const inventoryResponse = await axios.get(
      `https://openapi.etsy.com/v3/application/listings/${listingId}/inventory`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': ETSY_API_KEY
        }
      }
    );

    const inventoryData = inventoryResponse.data;

    res.json({
      success: true,
      taxonomyId,
      sizePropertyId,
      printTypePropertyId,
      allowedProperties: propertiesData.properties,
      currentInventory: inventoryData
    });

  } catch (error) {
    console.error('Error fetching property IDs:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});
    
// Health check
app.get('/', (req, res) => {
  res.send('Etsy Server Running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
