const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // Adicionando o cookie-parser

// Informações da sua aplicação Spotify
const CLIENT_ID = '7a36ab2fa1e149cebb0a752a65de4782';
const CLIENT_SECRET = '4176cb216d9145e19b16ef55b34e0193';
const REDIRECT_URI = 'http://127.0.0.1:3000/callback';
const stateKey = 'spotify_auth_state';

const app = express();
const port = 3000;

// Middleware para habilitar CORS e processar cookies
app.use(cors());
app.use(cookieParser()); // ESSA LINHA RESOLVE O SEU PROBLEMA
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Função para gerar uma string aleatória de caracteres alfanuméricos.
 * @param {number} length O comprimento da string.
 * @returns {string} A string aleatória.
 */
const generateRandomString = length => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

// Rota de login
app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  // Agora o cookie será salvo corretamente e lido na rota de callback
  res.cookie(stateKey, state);

  const scope = 'user-read-private user-read-email user-read-currently-playing streaming user-top-read user-modify-playback-state';

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT_URI,
      state: state
    })
  );
});

// Rota de callback após a autorização do Spotify
app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  // A partir de agora, req.cookies existirá e conterá o cookie de estado
  const storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
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
      res.redirect('/#' +
        querystring.stringify({
          error: 'invalid_token'
        }));
    }
  }
});

// Nova rota para renovar o token de acesso
app.get('/refresh_token', async (req, res) => {
  const refreshToken = req.query.refresh_token;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }

  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
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

// Nova rota para buscar músicas
app.get('/search-tracks', async (req, res) => {
  const query = req.query.q;
  const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;

  if (!query || !token) {
    return res.status(400).json({ error: 'Query and token are required.' });
  }

  const searchOptions = {
    url: `https://www.google.com/search?q=https://api.spotify.com/v1/search%3Fq%3D$${encodeURIComponent(query)}&type=track&limit=10`,
    method: 'get',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await axios(searchOptions);
    res.json(response.data);
  } catch (error) {
    console.error("Erro ao buscar músicas:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to search tracks' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
  console.log(`Abra http://localhost:${port} no seu navegador.`);
});