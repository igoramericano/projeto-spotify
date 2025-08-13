// 1. Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

// 2. Importa as dependências do Node.js
const express = require('express');
const cors = require('cors');
const path = require('path');

// Importa node-fetch para fazer requisições HTTP, para Node.js versões < 18
const fetch = require('node-fetch');

// 3. Inicializa o servidor Express
const app = express();
const PORT = process.env.PORT || 3000;

// 4. Configurações do servidor
app.use(cors());
app.use(express.json());
// Serve os arquivos estáticos (como o seu index.html) da pasta raiz do projeto
app.use(express.static(__dirname));

// 5. Carrega as credenciais da API do Spotify
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Verificações para garantir que as credenciais estão presentes
if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    console.error('Erro: CLIENT_ID, CLIENT_SECRET ou REDIRECT_URI não definidos.');
    console.error('Verifique seu arquivo .env.');
    process.exit(1);
}

const CLIENT_ID_BASE64 = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

// 6. Rota de login
app.get('/login', (req, res) => {
    const scopes = 'user-read-private user-read-email streaming user-read-playback-state user-modify-playback-state';
    
    // CORREÇÃO: URL de login correta da API do Spotify
    const spotifyLoginUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    
    res.redirect(spotifyLoginUrl);
});

// 7. Rota de callback
app.get('/callback', async (req, res) => {
    const code = req.query.code || null;

    if (!code) {
        return res.status(400).json({ error: 'Código de autorização não encontrado.' });
    }

    try {
        // CORREÇÃO: URL correta para o token exchange
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${CLIENT_ID_BASE64}`
            },
            body: `grant_type=authorization_code&code=${code}&redirect_uri=${REDIRECT_URI}`
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Erro ao obter o token:', errorText);
            throw new Error(`Erro na API do Spotify (token exchange): ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const { access_token, refresh_token, expires_in } = data;

        res.redirect(`http://localhost:3000/#access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`);
    } catch (error) {
        console.error('Erro no callback:', error);
        res.status(500).json({ error: 'Erro ao obter o token de acesso.' });
    }
});

// 8. Rota para renovar o token
app.get('/refresh_token', async (req, res) => {
    const refreshToken = req.query.refresh_token;

    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token é obrigatório.' });
    }

    try {
        // CORREÇÃO: URL correta para renovar o token
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${CLIENT_ID_BASE64}`
            },
            body: `grant_type=refresh_token&refresh_token=${refreshToken}`
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro na API do Spotify (refresh token): ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao renovar o token:', error);
        res.status(500).json({ error: 'Erro ao renovar o token.' });
    }
});

// 9. Rota de pesquisa
app.get('/search-tracks', async (req, res) => {
    const query = req.query.q;
    const userToken = req.headers.authorization;

    if (!query) {
        return res.status(400).json({ error: 'Parâmetro de busca "q" é obrigatório.' });
    }
    if (!userToken) {
        return res.status(401).json({ error: 'Token de autorização do usuário é obrigatório.' });
    }

    try {
        // CORREÇÃO: URL de busca correta, com o endpoint e a query string
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`, {
            method: 'GET',
            headers: {
                'Authorization': userToken
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro na API do Spotify (busca): ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar músicas:', error);
        res.status(500).json({ error: 'Erro ao buscar músicas.' });
    }
});

// 10. Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor de backend rodando em http://localhost:${PORT}`);
});