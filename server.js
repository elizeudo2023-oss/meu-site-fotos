const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Garante que pastas existem
const pendentePath = path.join(__dirname, 'uploads', 'pendente');
const postadasPath = path.join(__dirname, 'uploads', 'postadas');
if (!fs.existsSync(pendentePath)) fs.mkdirSync(pendentePath, { recursive: true });
if (!fs.existsSync(postadasPath)) fs.mkdirSync(postadasPath, { recursive: true });

// Serve arquivos estaticos - ISSO DEIXA O INSTAGRAM ENXERGAR
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Rota para listar fotos pendentes (que a automacao do Make/n8n vai usar)
app.get('/api/pendentes', (req, res) => {
  try {
    const files = fs.readdirSync(pendentePath).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const lista = files.map(file => ({
      nome: file,
      url: `${baseUrl}/uploads/pendente/${file}`
    }));
    res.json(lista);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/postadas', (req, res) => {
  try {
    const files = fs.readdirSync(postadasPath).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const lista = files.map(file => ({
      nome: file,
      url: `${baseUrl}/uploads/postadas/${file}`
    }));
    res.json(lista);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => {
  res.send('meu-site-fotos online - uploads liberados para Instagram');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
