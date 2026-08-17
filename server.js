require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cron = require('node-cron');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'SEU_TOKEN_AQUI';
const IG_USER_ID = process.env.IG_USER_ID || '17841448197640773';
const API_VERSION = 'v26.0';
const GRAPH_URL = `https://graph.facebook.com/${API_VERSION}`;

function getFotosPendentes() {
  const pasta = path.join(__dirname, 'uploads/pendentes');
  if (!fs.existsSync(pasta)) return [];
  return fs.readdirSync(pasta).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
}

function getProximaFoto() {
  const fotos = getFotosPendentes();
  if (fotos.length === 0) return null;
  // pega a primeira da lista
  return fotos[0];
}

async function postarNoInstagram(nomeArquivo) {
  try {
    const host = process.env.RENDER_EXTERNAL_URL || `https://meu-site-fotos.onrender.com`;
    const image_url = `${host}/uploads/pendentes/${encodeURIComponent(nomeArquivo)}`;
    console.log(`[AUTO POST] Tentando postar: ${image_url}`);

    const containerRes = await axios.post(`${GRAPH_URL}/${IG_USER_ID}/media`, {
      image_url,
      caption: `${nomeArquivo} - Ensaio disponível 📸 Elizeudo Video e Foto Pacuja`,
      access_token: ACCESS_TOKEN
    });

    const creation_id = containerRes.data.id;
    await new Promise(r => setTimeout(r, 7000));

    const publishRes = await axios.post(`${GRAPH_URL}/${IG_USER_ID}/media_publish`, {
      creation_id,
      access_token: ACCESS_TOKEN
    });

    console.log(`[AUTO POST] Sucesso ID: ${publishRes.data.id}`);

    // mover para postadas
    const origem = path.join(__dirname, 'uploads/pendentes', nomeArquivo);
    const destinoDir = path.join(__dirname, 'uploads/postadas');
    if (!fs.existsSync(destinoDir)) fs.mkdirSync(destinoDir, {recursive: true});
    const destino = path.join(destinoDir, nomeArquivo);
    if (fs.existsSync(origem)) fs.renameSync(origem, destino);
    
    return true;
  } catch (e) {
    console.error('[AUTO POST ERRO]', e.response?.data || e.message);
    return false;
  }
}

// ===== ROTAS API =====
app.get('/api/pendentes', (req, res) => {
  const pasta = path.join(__dirname, 'uploads/pendentes');
  if (!fs.existsSync(pasta)) return res.json([]);
  const host = `https://${req.get('host')}`;
  const fotos = fs.readdirSync(pasta).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).map(nome => ({
    nome,
    url: `${host}/uploads/pendentes/${encodeURIComponent(nome)}`
  }));
  res.json(fotos);
});

app.post('/api/mover-postada', (req,res)=>{
  const {nome} = req.body;
  if(!nome) return res.status(400).json({error:'nome obrigatorio'});
  const origem = path.join(__dirname, 'uploads/pendentes', nome);
  const destinoDir = path.join(__dirname, 'uploads/postadas');
  if (!fs.existsSync(destinoDir)) fs.mkdirSync(destinoDir, {recursive: true});
  const destino = path.join(destinoDir, nome);
  try {
    if(fs.existsSync(origem)) fs.renameSync(origem, destino);
    res.json({success:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.post('/post-instagram', async (req, res) => {
  const {image_url, caption} = req.body;
  try{
    const containerRes = await axios.post(`${GRAPH_URL}/${IG_USER_ID}/media`, { image_url, caption: caption||'', access_token: ACCESS_TOKEN });
    const creation_id = containerRes.data.id;
    await new Promise(r=>setTimeout(r,5000));
    const publishRes = await axios.post(`${GRAPH_URL}/${IG_USER_ID}/media_publish`, { creation_id, access_token: ACCESS_TOKEN });
    res.json({success:true, id:publishRes.data.id});
  }catch(error){ res.status(500).json(error.response?.data || {error:error.message}); }
});

app.get('/', (req,res)=>res.send('API Elizeudo Video e Foto - Auto Post 9-23h ativo'));

// ===== LÓGICA AUTOMÁTICA =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);

  // 1) Posta 5 segundos depois de ativar
  setTimeout(async ()=>{
    const foto = getProximaFoto();
    if(foto){
      console.log(`[STARTUP] 5s se passaram, postando primeira foto: ${foto}`);
      await postarNoInstagram(foto);
    } else {
      console.log('[STARTUP] Nenhuma foto pendente');
    }
  }, 5000);

  // 2) Depois de hora em hora, mas só entre 9h e 23h (America/Fortaleza)
  cron.schedule('0 * * * *', async ()=>{
    const agora = new Date();
    // converte para Fortaleza (UTC-3)
    const horaFortaleza = new Date(agora.toLocaleString('en-US', {timeZone:'America/Fortaleza'})).getHours();
    console.log(`[CRON] Verificando hora: ${horaFortaleza}h`);
    if(horaFortaleza < 9 || horaFortaleza > 23){
      console.log('[CRON] Fora do horário 9-23h, não posta');
      return;
    }
    const foto = getProximaFoto();
    if(foto) await postarNoInstagram(foto);
    else console.log('[CRON] Sem fotos pendentes');
  }, { timezone: 'America/Fortaleza' });
});
