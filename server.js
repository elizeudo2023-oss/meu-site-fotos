require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SERVIR FOTOS - ESSENCIAL PARA O FORMIGA
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// CONFIG - Use variavel de ambiente no Render
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'EAAV6aiRIj60BSDWaqSomkbDuXICryP6t5ZC7qGZCZCnwf2RZA7Q5tuVQMPGB2ct6ZB78MnGYswKqy7WTOenn3MW9N9NqKB73GrZCFQc0fAIPeNDtULooyZBPBF7s4X2SRTih5iLUH5TcfTUd6eUXhxrPKk5kSbrKZBwoUJxqjb5W6nzUXW16MzbdnmfSmOBeB0M3kPRddjSqKZBY4';
const IG_USER_ID = process.env.IG_USER_ID || '17841448197640773';
const API_VERSION = 'v26.0';
const GRAPH_URL = `https://graph.facebook.com/${API_VERSION}`;

console.log(`API ${API_VERSION} IG ${IG_USER_ID} online`);

// ===== ROTA QUE FALTAVA - CORRIGIDA COM S =====
app.get('/api/pendentes', (req, res) => {
  const pastasPossiveis = [
    path.join(__dirname, 'uploads/pendentes'),
    path.join(__dirname, 'uploads/pendente'),
    path.join(__dirname, 'uploads')
  ];
  
  let fotos = [];
  for (const pasta of pastasPossiveis) {
    if (fs.existsSync(pasta)) {
      const arquivos = fs.readdirSync(pasta).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
      if (arquivos.length > 0) {
        const subpasta = path.basename(pasta);
        // se for a pasta uploads direto, usa raiz, senao usa subpasta
        const prefix = pasta.includes('uploads/pendente') ? `uploads/${subpasta}` : (subpasta === 'uploads' ? 'uploads' : `uploads/${subpasta}`);
        fotos = arquivos.map(nome => ({
          nome,
          url: `https://${req.get('host')}/${prefix === 'uploads' ? 'uploads' : prefix}/${encodeURIComponent(nome)}`
        }));
        // se achou em pendentes (com S) para aqui
        if (subpasta === 'pendentes') break;
      }
    }
  }
  res.json(fotos);
});

// Rota para postar no Instagram
app.post('/post-instagram', async (req, res) => {
    try {
        const { image_url, caption } = req.body;
        if (!image_url) return res.status(400).json({ error: 'image_url é obrigatório' });

        console.log('Criando container para', image_url);
        const containerRes = await axios.post(`${GRAPH_URL}/${IG_USER_ID}/media`, {
            image_url: image_url,
            caption: caption || '',
            access_token: ACCESS_TOKEN
        });

        const creation_id = containerRes.data.id;
        console.log('Container:', creation_id);
        await new Promise(r => setTimeout(r, 5000));

        const publishRes = await axios.post(`${GRAPH_URL}/${IG_USER_ID}/media_publish`, {
            creation_id: creation_id,
            access_token: ACCESS_TOKEN
        });

        console.log('Publicado:', publishRes.data.id);
        res.json({ success: true, id: publishRes.data.id });

    } catch (error) {
        console.error('Erro ao postar:', error.response?.data || error.message);
        res.status(500).json({ 
            error: error.response?.data?.error?.message || error.message,
            details: error.response?.data
        });
    }
});

app.get('/get-page-token', async (req, res) => {
    try {
        const response = await axios.get(`${GRAPH_URL}/me/accounts`, {
            params: { access_token: ACCESS_TOKEN }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json(error.response?.data || error.message);
    }
});

app.get('/', (req, res) => {
    res.send('API Elizeudo Video e Foto - Online v26.0 - /api/pendentes liberado');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
