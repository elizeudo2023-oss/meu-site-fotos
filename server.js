const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const CAMINHO_HD_EVENTOS = 'G:\\EVENTOS FOTOS';
const CAMINHO_HD_LOJA = 'G:\\VENDASFOTOS';

const pagamentosPendentes = {};

const CAMINHO_PREVIEWS_LOJA = path.join(__dirname, 'previews-loja');
if (!fs.existsSync(CAMINHO_PREVIEWS_LOJA)) {
    fs.mkdirSync(CAMINHO_PREVIEWS_LOJA, { recursive: true });
}

// ==================== CONFIG INSTAGRAM - ATUALIZADO ====================
const ACCESS_TOKEN = 'EAAV6aiRIj60BSDWaqSomkbDuXICryP6t5ZC7qGZCZCnwf2RZA7Q5tuVQMPGB2ct6ZB78MnGYswKqy7WTOenn3MW9N9NqKB73GrZCFQc0fAIPeNDtULooyZBPBF7s4X2SRTih5iLUH5TcfTUd6eUXhxrPKk5kSbrKZBwoUJxqjb5W6nzUXW16MzbdnmfSmOBeB0M3kPRddjSqKZBY4';
const IG_USER_ID = '17841448197640773';
const API_VERSION = 'v26.0';
const GRAPH_URL = `https://graph.facebook.com/${API_VERSION}`;
const BASE_URL = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

function garantirPastasInstagram(){
  const caminhos = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'uploads', 'pendentes'),
    path.join(__dirname, 'uploads', 'postadas'),
  ];
  caminhos.forEach(p => { if(!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); });
}
garantirPastasInstagram();

function pegarFotoPendente(){
  const pasta = path.join(__dirname, 'uploads', 'pendentes');
  if(!fs.existsSync(pasta)) return null;
  const arquivos = fs.readdirSync(pasta).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  if(arquivos.length > 0){
    // pega a mais antiga (primeira criada)
    arquivos.sort((a,b) => fs.statSync(path.join(pasta, a)).mtimeMs - fs.statSync(path.join(pasta, b)).mtimeMs);
    return { pasta, arquivo: arquivos[0], caminhoCompleto: path.join(pasta, arquivos[0]) };
  }
  return null;
}

async function postarNoInstagram(image_url, caption = ''){
  console.log(`[INSTA] Postando: ${image_url}`);
  const containerRes = await axios.post(`${GRAPH_URL}/${IG_USER_ID}/media`, {
    image_url, caption, access_token: ACCESS_TOKEN
  });
  const creation_id = containerRes.data.id;
  console.log(`[INSTA] Container: ${creation_id}`);
  await new Promise(r => setTimeout(r, 5000));
  const publishRes = await axios.post(`${GRAPH_URL}/${IG_USER_ID}/media_publish`, {
    creation_id, access_token: ACCESS_TOKEN
  });
  console.log(`[INSTA] PUBLICADO: ${publishRes.data.id}`);
  return publishRes.data;
}

function dentroDoHorarioPermitido(){
  const agora = new Date();
  // Ajusta para horário de Brasília (UTC-3)
  const horaBrasilia = new Date(agora.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  const hora = horaBrasilia.getHours();
  // Permite postar das 8h até 23h (23 inclusive)
  return hora >= 8 && hora <= 23;
}

async function rotinaAutomatica(){
  // Verifica horário
  if(!dentroDoHorarioPermitido()){
    const agora = new Date().toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo"});
    console.log(`[${agora}] [INSTA] Fora do horário (8h-23h). Aguardando...`);
    return;
  }

  const pendente = pegarFotoPendente();
  if(!pendente){
    console.log(`[${new Date().toLocaleTimeString()}] [INSTA] Nenhuma foto em uploads/pendentes`);
    return;
  }
  try{
    const { arquivo, caminhoCompleto } = pendente;
    const image_url = `${BASE_URL}/uploads/pendentes/${encodeURIComponent(arquivo)}`;
    
    console.log(`[INSTA] Tentando: ${image_url}`);
    
    await postarNoInstagram(image_url, '📸 Elizeudo Vídeo e Foto - www.elizeudovideoefoto.com');

    const destinoPasta = path.join(__dirname, 'uploads', 'postadas');
    if(!fs.existsSync(destinoPasta)) fs.mkdirSync(destinoPasta, { recursive: true });
    fs.renameSync(caminhoCompleto, path.join(destinoPasta, arquivo));
    console.log(`[INSTA] ✅ Movido para postadas: ${arquivo}`);

  }catch(err){
    const detalhe = err.response?.data || err.message;
    console.error('[INSTA] ❌ Erro:', JSON.stringify(detalhe, null, 2));
  }
}
// ==================== FIM INSTAGRAM ====================

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/destaques', express.static(path.join(__dirname, 'destaques')));
app.use('/hd-eventos', express.static(CAMINHO_HD_EVENTOS));
app.use('/previews-loja', express.static(CAMINHO_PREVIEWS_LOJA));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const client = new MercadoPagoConfig({ 
    accessToken: 'APP_USR-3422053578959720-081314-609b64b515cfbbd0d18b7f9ddc345fbb-104371778' 
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'elizeudo2023@gmail.com', pass: 'ghyzptswumjowliu' }
});

function enviarEmailVendaAprovada(carrinho, pagamentoId) {
    let listaFotos = carrinho.map(f => f.caminhoOriginal || f.url || f.nome).join('\n - ');
    transporter.sendMail({
        from: 'elizeudo2023@gmail.com',
        to: 'elizeudo2023@gmail.com',
        subject: `Venda Aprovada - ID: ${pagamentoId}`,
        text: `Venda aprovada!\nID: ${pagamentoId}\nFotos:\n - ${listaFotos}`
    }, (e, i) => { if(e) console.error(e); else console.log('Email enviado', i.response); });
}

async function gerarPreviewComMarcaDagua(nomePasta, nomeArquivo) {
    const caminhoOriginal = path.resolve(CAMINHO_HD_LOJA, nomePasta, nomeArquivo);
    const pastaDestinoPreview = path.resolve(CAMINHO_PREVIEWS_LOJA, nomePasta);
    if (!fs.existsSync(pastaDestinoPreview)) fs.mkdirSync(pastaDestinoPreview, { recursive: true });
    const caminhoPreview = path.resolve(pastaDestinoPreview, nomeArquivo);
    if (fs.existsSync(caminhoPreview)) return;
    try {
        if (!fs.existsSync(caminhoOriginal)) return;
        const bufferBase = await sharp(caminhoOriginal).rotate().resize({ width: 900, fit: 'inside' }).toBuffer();
        const { width, height } = await sharp(bufferBase).metadata();
        const svg = `<svg width="${width}" height="${height}"><style>.r{fill:rgba(255,255,255,0.6);font-size:30px;font-weight:bold;font-family:Arial}.c{fill:rgba(255,0,0,0.85);font-size:65px;font-weight:bold;font-family:Arial;text-anchor:middle;dominant-baseline:middle}</style><text x="5%" y="10%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="35%" y="10%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="65%" y="10%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="20%" y="25%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="50%" y="25%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="80%" y="25%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="5%" y="40%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="35%" y="40%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="65%" y="40%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="20%" y="55%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="50%" y="55%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="80%" y="55%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="5%" y="70%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="35%" y="70%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="65%" y="70%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="20%" y="85%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="50%" y="85%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><text x="80%" y="85%" class="r" transform="rotate(-25)">SOMENTE VENDA</text><g transform="rotate(-15, ${width/2}, ${height/2})"><text x="50%" y="${height/2-75}" class="c">SOMENTE VENDA</text><text x="50%" y="${height/2}" class="c">SOMENTE VENDA</text><text x="50%" y="${height/2+75}" class="c">SOMENTE VENDA</text></g></svg>`;
        await sharp(bufferBase).composite([{ input: Buffer.from(svg), blend: 'over' }]).jpeg({ quality: 85 }).toFile(caminhoPreview);
    } catch (e) { console.error(e.message); }
}

app.get('/api/destaques', (req, res) => {
    const dir = path.join(__dirname, 'destaques');
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter(f => ['.jpg', '.png', '.jpeg'].includes(path.extname(f).toLowerCase()));
    res.json(files.map(f => `/destaques/${encodeURIComponent(f)}`));
});
app.get('/api/eventos', (req, res) => {
    try {
        if (!fs.existsSync(CAMINHO_HD_EVENTOS)) return res.json([]);
        const list = fs.readdirSync(CAMINHO_HD_EVENTOS);
        res.json(list.filter(f => fs.statSync(path.join(CAMINHO_HD_EVENTOS, f)).isDirectory()).map(f => ({ nome: f })));
    } catch (e) { res.json([]); }
});
app.get('/api/eventos/:nomeEvento', (req, res) => {
    try {
        const nome = decodeURIComponent(req.params.nomeEvento);
        const dir = path.join(CAMINHO_HD_EVENTOS, nome);
        if (!fs.existsSync(dir)) return res.json([]);
        const files = fs.readdirSync(dir).filter(f => ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase()));
        res.json(files.map(f => `/hd-eventos/${encodeURIComponent(nome)}/${encodeURIComponent(f)}`));
    } catch (e) { res.json([]); }
});
app.get('/api/loja', (req, res) => {
    try {
        if (!fs.existsSync(CAMINHO_HD_LOJA)) return res.json([]);
        const list = fs.readdirSync(CAMINHO_HD_LOJA);
        res.json(list.filter(f => fs.statSync(path.join(CAMINHO_HD_LOJA, f)).isDirectory()).map(f => ({ nome: f })));
    } catch (e) { res.json([]); }
});
app.get('/api/loja/:nomePasta', async (req, res) => {
    try {
        const nome = decodeURIComponent(req.params.nomePasta);
        const dir = path.join(CAMINHO_HD_LOJA, nome);
        if (!fs.existsSync(dir)) return res.json([]);
        const files = fs.readdirSync(dir).filter(f => ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase()));
        const fotos = [];
        for (let f of files) {
            await gerarPreviewComMarcaDagua(nome, f);
            fotos.push({ nome: f, preco: 0.01, url: `/previews-loja/${encodeURIComponent(nome)}/${encodeURIComponent(f)}`, caminhoOriginal: path.join(nome, f) });
        }
        res.json(fotos);
    } catch (e) { res.json([]); }
});
app.get('/api/download-original', (req, res) => {
    try {
        const arquivoRelativo = req.query.arquivo;
        if (!arquivoRelativo) return res.status(400).send("Arquivo não informado.");
        const caminho = path.join(CAMINHO_HD_LOJA, arquivoRelativo);
        if (fs.existsSync(caminho)) res.download(caminho);
        else res.status(404).send("Não encontrado.");
    } catch (e) { res.status(500).send("Erro download."); }
});
app.post('/api/criar-pix', async (req, res) => {
    try {
        const { carrinho } = req.body;
        if (!carrinho || !carrinho.length) return res.status(400).json({ error: 'Carrinho vazio' });
        const valorTotal = carrinho.reduce((a, i) => a + i.preco, 0);
        const payment = new Payment(client);
        const response = await payment.create({ body: { transaction_amount: Number(valorTotal.toFixed(2)), description: 'Compra Fotos - Elizeudo', payment_method_id: 'pix', payer: { email: 'cliente@elizeudovideoefoto.com' } } });
        pagamentosPendentes[response.id] = { carrinho, emailEnviado: false };
        res.json({ id: response.id, status: response.status, qr_code: response.point_of_interaction.transaction_data.qr_code, qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64 });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Erro Pix' }); }
});
app.get('/api/verificar-pagamento/:id', async (req, res) => {
    try {
        const payment = new Payment(client);
        const response = await payment.get({ id: req.params.id });
        if (response.status === 'approved') {
            const pedido = pagamentosPendentes[req.params.id];
            if (pedido && !pedido.emailEnviado) { enviarEmailVendaAprovada(pedido.carrinho, req.params.id); pedido.emailEnviado = true; }
        }
        res.json({ status: response.status });
    } catch (e) { res.status(500).json({ error: 'Erro consulta' }); }
});

app.post('/post-instagram', async (req, res) => {
  try{
    const { image_url, caption } = req.body;
    if(!image_url) return res.status(400).json({error:'image_url obrigatório'});
    const r = await postarNoInstagram(image_url, caption || 'Elizeudo Vídeo e Foto 📸');
    res.json({ success:true, r });
  }catch(e){ res.status(500).json({ error: e.response?.data || e.message, details: e.response?.data }); }
});

app.get('/api/instagram/status', (req, res) => {
  const pend = path.join(__dirname, 'uploads', 'pendentes');
  const post = path.join(__dirname, 'uploads', 'postadas');
  res.json({ base_url: BASE_URL, agora_brasilia: new Date().toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo"}), horario_permitido: "8h às 23h", pendentes: fs.existsSync(pend) ? fs.readdirSync(pend) : [], postadas: fs.existsSync(post) ? fs.readdirSync(post) : [], token: API_VERSION });
});

app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`✅ Instagram BASE_URL: ${BASE_URL}`);
  console.log(`✅ Automação: 1ª foto em 5s após iniciar, depois 1 a cada 1h (8h-23h BRT)`);
  
  // NOVA LÓGICA DE TEMPO PEDIDA POR VOCÊ
  console.log(`[INSTA] Agendando primeira postagem em 5 segundos...`);
  setTimeout(() => {
    console.log(`[INSTA] Executando primeira postagem (5s após iniciar)...`);
    rotinaAutomatica();
  }, 5 * 1000); // 5 segundos após iniciar
});

// Agora a cada 1 HORA (3600000 ms) e só dentro do horário 8h-23h
setInterval(rotinaAutomatica, 60 * 60 * 1000); // 1 hora
