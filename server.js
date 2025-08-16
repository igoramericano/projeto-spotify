const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const CLIENT_ID = '7a36ab2fa1e149cebb0a752a65de4782';
const CLIENT_SECRET = '5e0fbc0b04174b46b55eb411c2ecb018';
const REDIRECT_URI = 'https://projeto-spotify-three.vercel.app/callback'; // CORRIGIDO
const stateKey = 'spotify_auth_state';

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';

const generateRandomString = length => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  res.cookie(stateKey, state);

  const scope = 'user-read-private user-read-email user-read-currently-playing streaming user-top-read user-modify-playback-state user-library-modify user-library-read user-read-recently-played';

  res.redirect(`${SPOTIFY_ACCOUNTS_BASE}/authorize?` +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT_URI,
      state: state
    })
  );
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
  } else {
    res.clearCookie(stateKey);
    const authOptions = {
      url: `${SPOTIFY_ACCOUNTS_BASE}/api/token`,
      method: 'post',
      data: querystring.stringify({
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      }),
      headers: {
        'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    try {
      const response = await axios(authOptions);
      const { access_token, refresh_token, expires_in } = response.data;
      res.redirect(`/#access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`);
    } catch (error) {
      console.error("Erro ao obter o token:", error.response ? error.response.data : error.message);
      res.redirect('/#' + querystring.stringify({ error: 'invalid_token' }));
    }
  }
});

app.get('/refresh_token', async (req, res) => {
  const refreshToken = req.query.refresh_token;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }

  const authOptions = {
    url: `${SPOTIFY_ACCOUNTS_BASE}/api/token`,
    method: 'post',
    data: querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }),
    headers: {
      'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')),
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };

  try {
    const response = await axios(authOptions);
    const { access_token, expires_in } = response.data;
    res.json({ access_token, expires_in });
  } catch (error) {
    console.error("Erro ao renovar o token:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

app.get('/search-tracks', async (req, res) => {
  const query = req.query.q;
  const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;

  if (!query || !token) {
    return res.status(400).json({ error: 'Query and token are required.' });
  }

  const searchOptions = {
    url: `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
    method: 'get',
    headers: { 'Authorization': `Bearer ${token}` }
  };

  try {
    const response = await axios(searchOptions);
    res.json(response.data);
  } catch (error) {
    console.error("Erro ao buscar músicas:", error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).json({ error: 'Failed to search tracks' });
  }
});

app.put('/play-track', async (req, res) => {
    const { trackUri, deviceId } = req.body;
    const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;

    if (!token || !trackUri || !deviceId) {
        return res.status(400).json({ error: 'Token, track URI and device ID are required.' });
    }

    const playOptions = {
        url: `${SPOTIFY_API_BASE}/me/player/play`,
        method: 'put',
        data: { uris: [trackUri] },
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        params: { device_id: deviceId }
    };

    try {
        await axios(playOptions);
        res.status(204).send();
    } catch (error) {
        console.error("Erro ao iniciar a reprodução:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ error: 'Failed to start playback' });
    }
});

app.get('/recently-played', async (req, res) => {
    const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;

    if (!token) {
        return res.status(400).json({ error: 'Token is required.' });
    }

    const playedOptions = {
        url: `${SPOTIFY_API_BASE}/me/player/recently-played`,
        method: 'get',
        headers: { 'Authorization': `Bearer ${token}` }
    };

    try {
        const response = await axios(playedOptions);
        res.json(response.data);
    } catch (error) {
        console.error("Erro ao buscar histórico:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ error: 'Failed to fetch recently played tracks' });
    }
});

app.get('/my-tracks', async (req, res) => {
    const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;

    if (!token) {
        return res.status(400).json({ error: 'Token is required.' });
    }

    const myTracksOptions = {
        url: `${SPOTIFY_API_BASE}/me/tracks`,
        method: 'get',
        headers: { 'Authorization': `Bearer ${token}` }
    };

    try {
        const response = await axios(myTracksOptions);
        res.json(response.data);
    } catch (error) {
        console.error("Erro ao buscar músicas da biblioteca:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ error: 'Failed to fetch my tracks' });
    }
});

app.put('/add-to-library', async (req, res) => {
    const { trackId } = req.body;
    const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;

    if (!token || !trackId) {
        return res.status(400).json({ error: 'Token and track ID are required.' });
    }

    const addOptions = {
        url: `${SPOTIFY_API_BASE}/me/tracks`,
        method: 'put',
        data: { ids: [trackId] },
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    try {
        await axios(addOptions);
        res.status(200).json({ message: 'Track added to library.' });
    } catch (error) {
        console.error("Erro ao adicionar a música à biblioteca:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ error: 'Failed to add track to library' });
    }
});

module.exports = app;