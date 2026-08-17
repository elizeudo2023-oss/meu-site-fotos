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

const ACCESS_TOKEN = process.env.ACCESS_TOKEN || 'EAAV6aiRIj60BSAbZBBvMXTXxiq64pmKDJo2bFH1IqGLvCVzZAYlM51m9Oz1j9P8zZCTuK25PjlZB0ZAVukUOVoTFZAO3B5PUZC08a0GUgIZB9tuZAkf8fU4HygQySZA3JNEkMn5II1wJWFxvucAhJL9sAGnqIecZAAQrDqGpZAZAMBWZA3POyCknNmgGjAHUoG83ZBXZB4bWdZBiMtFsJVrxyY5oLItssbQP2gNUmfauXr4bwUaiJ2h6A00sUacfBKZBplvYg1PwbXrPMybrjSMuzYe9DqtKzHJFS5RmbiZB7cx9QZDZD';
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
  return fotos[0];
}
async function postarNoInstagram(nomeArquivo) {
  try {
    const host = process.env.RENDER_EXTERNAL_URL || 'https://meu-site-fotos.onrender.com';
    const image_url = `${host}/uploads/pendentes/${encodeURIComponent(nomeArquivo)}`;
    console.log(`[AUTO POST] Postando: ${image_url}`);
    const containerRes = await axios.post(`${GRAPH_URL}/${IG_USER_ID}/media`, {
      image_url,
      caption: `${nomeArquivo} - Ensaio disponivel 📸 Elizeudo Video e Foto Pacuja`,
      access_token: ACCESS_TOKEN
    });
    const creation_id = containerRes.data.id;
    await new Promise(r => setTimeout(r, 7000));
    const publishRes = await axios.post(`${GRAPH_URL}/${IG_USER_ID}/media_publish`, {
      creation_id,
      access_token: ACCESS_TOKEN
    });
    console.log(`[AUTO POST] Sucesso ID: ${publishRes.data.id}`);
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

app.get('/', (req,res)=>res.send('API Elizeudo Video e Foto - Auto Post 9-23h ativo com novo token'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  setTimeout(async ()=>{
    const foto = getProximaFoto();
    if(foto){
      console.log(`[STARTUP] 5s se passaram, postando: ${foto}`);
      await postarNoInstagram(foto);
    } else {
      console.log('[STARTUP] Nenhuma foto pendente');
    }
  }, 5000);
  cron.schedule('0 * * * *', async ()=>{
    const agora = new Date();
    const horaFortaleza = new Date(agora.toLocaleString('en-US', {timeZone:'America/Fortaleza'})).getHours();
    console.log(`[CRON] Hora Fortaleza: ${horaFortaleza}h`);
    if(horaFortaleza < 9 || horaFortaleza > 23){
      console.log('[CRON] Fora do horario 9-23h');
      return;
    }
    const foto = getProximaFoto();
    if(foto) await postarNoInstagram(foto);
    else console.log('[CRON] Sem fotos pendentes');
  }, { timezone: 'America/Fortaleza' });
});
