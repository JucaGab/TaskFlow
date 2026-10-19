const express = require('express');
const { engine } = require('express-handlebars');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const sessions = new Map();
const SESSION_COOKIE = 'taskflow.sid';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const catalog = [
  {
    title: 'Órbita Final',
    synopsis: 'Uma equipe de exploradores recebe um sinal vindo de uma região distante do universo.',
    genre: 'Ficção científica',
    year: 2025,
    badge: 'FILME',
    poster: 'poster--space',
    initials: 'OF'
  },
  {
    title: 'A Cidade Submersa',
    synopsis: 'Uma mergulhadora descobre os segredos de uma cidade que desapareceu sob o oceano.',
    genre: 'Aventura',
    year: 2024,
    badge: 'FILME',
    poster: 'poster--ocean',
    initials: 'CS'
  },
  {
    title: 'Entre Estações',
    synopsis: 'Duas famílias seguem caminhos inesperados ao longo de várias gerações.',
    genre: 'Drama',
    year: 2023,
    badge: 'SÉRIE',
    poster: 'poster--drama',
    initials: 'EE'
  },
  {
    title: 'Arquivo Nebulosa',
    synopsis: 'Uma investigadora conecta casos misteriosos a uma antiga estação de pesquisa.',
    genre: 'Mistério',
    year: 2025,
    badge: 'SÉRIE',
    poster: 'poster--mystery',
    initials: 'AN'
  },
  {
    title: 'O Último Verão',
    synopsis: 'Amigos se reencontram e tentam recuperar os planos que deixaram para trás.',
    genre: 'Comédia',
    year: 2022,
    badge: 'FILME',
    poster: 'poster--summer',
    initials: 'UV'
  },
  {
    title: 'Reino de Cinzas',
    synopsis: 'Uma jovem herdeira precisa proteger seu reino e descobrir em quem pode confiar.',
    genre: 'Fantasia',
    year: 2024,
    badge: 'SÉRIE',
    poster: 'poster--fantasy',
    initials: 'RC'
  }
];

app.engine('handlebars', engine({
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views', 'layouts')
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function readCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  const entry = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return null;
  }
}

app.use((req, res, next) => {
  const sessionId = readCookie(req, SESSION_COOKIE);
  const userId = sessionId ? sessions.get(sessionId) : null;
  req.currentUser = userId ? userId : null;
  res.locals.currentUser = req.currentUser;
  next();
});

async function readUsers() {
  try {
    return JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveUsers(users) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporaryFile = USERS_FILE + '.tmp';
  await fs.writeFile(temporaryFile, JSON.stringify(users, null, 2), 'utf8');
  await fs.rename(temporaryFile, USERS_FILE);
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = await scrypt(password, salt, 64);
  return { salt, hash: derivedKey.toString('hex') };
}

function startSession(userId, res) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, userId);
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE,
    path: '/'
  });
}

function requireAuth(req, res, next) {
  if (!req.currentUser) return res.redirect('/login');
  next();
}

app.get('/', (req, res) => {
  res.redirect(req.currentUser ? '/catalog' : '/login');
});

app.get('/register', (req, res) => {
  if (req.currentUser) return res.redirect('/catalog');
  res.render('register', { title: 'Criar conta' });
});

app.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (name.length < 2 || name.length > 80) {
      return res.status(400).render('register', {
        title: 'Criar conta',
        error: 'Informe um nome entre 2 e 80 caracteres.',
        name,
        email
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).render('register', {
        title: 'Criar conta',
        error: 'Informe um e-mail válido.',
        name,
        email
      });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).render('register', {
        title: 'Criar conta',
        error: 'A senha deve ter entre 8 e 128 caracteres.',
        name,
        email
      });
    }

    const users = await readUsers();
    if (users.some((user) => user.email === email)) {
      return res.status(409).render('register', {
        title: 'Criar conta',
        error: 'Já existe uma conta com esse e-mail.',
        name,
        email
      });
    }

    const credentials = await hashPassword(password);
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordSalt: credentials.salt,
      passwordHash: credentials.hash,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    await saveUsers(users);
    startSession(user.id, res);
    res.redirect('/catalog');
  } catch (error) {
    next(error);
  }
});

app.get('/login', (req, res) => {
  if (req.currentUser) return res.redirect('/catalog');
  res.render('login', { title: 'Entrar' });
});

app.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const users = await readUsers();
    const user = users.find((candidate) => candidate.email === email);

    if (!user) {
      return res.status(401).render('login', {
        title: 'Entrar',
        error: 'E-mail ou senha inválidos.',
        email
      });
    }

    const suppliedHash = await scrypt(password, user.passwordSalt, 64);
    const expectedHash = Buffer.from(user.passwordHash, 'hex');
    if (suppliedHash.length !== expectedHash.length || !crypto.timingSafeEqual(suppliedHash, expectedHash)) {
      return res.status(401).render('login', {
        title: 'Entrar',
        error: 'E-mail ou senha inválidos.',
        email
      });
    }

    startSession(user.id, res);
    res.redirect('/catalog');
  } catch (error) {
    next(error);
  }
});

app.post('/logout', (req, res) => {
  const sessionId = readCookie(req, SESSION_COOKIE);
  if (sessionId) sessions.delete(sessionId);
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
  res.redirect('/login');
});

app.get('/catalog', requireAuth, async (req, res, next) => {
  try {
    const users = await readUsers();
    const user = users.find((candidate) => candidate.id === req.currentUser);
    if (!user) return res.redirect('/login');

    res.locals.currentUser = { name: user.name, email: user.email };
    res.render('catalog', {
      title: 'Catálogo',
      firstName: user.name.split(' ')[0],
      catalog
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render('error', {
    title: 'Erro',
    error: 'Não foi possível concluir sua solicitação. Tente novamente.'
  });
});

app.listen(PORT, () => {
  console.log('TaskFlow Filmes e Séries disponível em http://localhost:' + PORT);
});
