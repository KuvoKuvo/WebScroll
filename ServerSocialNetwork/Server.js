const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const WebSocket = require('ws');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());


const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);


const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}_${Math.random().toString(36).substring(2)}${ext}`;
    cb(null, filename);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('это не изображение!!!!'), false);
    cb(null, true);
  }
});

const db = new sqlite3.Database('этоБаза.db');


const sessions = new Map();

app.use('/uploads', express.static(uploadDir));


app.post('/register', (req, res) => {
  const { Mail, Name, Password } = req.body;
  if (!Mail || !Name || !Password) return res.status(400).json({ message: "Заполните все поля" });

  db.get("select * from Users where Mail = ?", [Mail], (err, userByMail) => {
    if (err) {
      console.error('Ошибка при проверке маил:', err);
      return res.status(500).json({ message: "Ошибка сервера" });
    }
    if (userByMail) return res.status(400).json({ message: "у вас уже есть акаунт" });

    db.get("select * from Users where Name = ?", [Name], (err, userByName) => {
      if (err) {
        console.error('Ошибка при проверке Name:', err);
        return res.status(500).json({ message: "Ошибка сервера" });
      }
      if (userByName) return res.status(400).json({ message: "Имя уже используется" });

      db.run(
        `insert into Users (Mail, Name, Role, Password) VALUES (?, ?, 2, ?)`,
        [Mail, Name, Password],
        function (err) {
          if (err) {
            console.error('Ошибка вставки в Users:', err);
            return res.status(500).json({ message: "Ошибка сервера" });
          }
          res.json({ message: "Регистрация успешна", userId: this.lastID });
        }
      );
    });
  });
});


app.post('/login', (req, res) => {
  const { Mail, Password } = req.body;
  if (!Mail || !Password) return res.status(400).json({ message: "Заполните все поля" });

  db.get("select * from Users where Mail = ?", [Mail], (err, user) => {
    if (!user || user.Password !== Password) return res.status(400).json({ message: "Неверный email или пароль" });

    res.json({
      message: "Авторизация успешна",
      user: {
        id: user.Id,
        name: user.Name,
        mail: user.Mail,
        role: user.Role
      }
    });
  });
});


app.post('/upload', upload.single('image'), (req, res) => {
  const userId = req.headers['x-user-id'];

  if (!userId || !req.file) {
    return res.status(400).json({ message: 'Ошибка загрузки' });
  }

  db.get('select * from Users where Id = ?', [userId], (err, user) => {
    if (!user) return res.status(401).json({ message: 'Нет пользователя' });

    db.run(
      `insert into Images (UserId, Filenshka, UploadedAt)
       VALUES (?, ?, ?)`,
      [userId, req.file.filename, Date.now()],
      function (err) {
        if (err) return res.status(500).json({ message: 'Ошибка БД' });

        const imageData = {
          Id: this.lastID,
          fileshka: req.file.filename,
          UserId: user.Id,
          UserName: user.Name,
          UploadedAt: Date.now()
        };


        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'new-image',
              image: imageData
            }));
          }
        });

        res.json({
          message: 'OK',
          id: this.lastID,
          fileshka: req.file.filename
        });
      }
    );
  });
});

app.get('/images', (req, res) => {
  db.all(
    `
    SELECT
      Images.Id,
      Images.Filenshka AS fileshka,
      Images.UserId,
      Users.Name AS UserName,
      Images.UploadedAt
    FROM Images
    LEFT JOIN Users ON Users.Id = Images.UserId
    ORDER BY Images.UploadedAt DESC
    `,
    [],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ошибка сервера' });
      }
      res.json(rows);
    }
  );
});

app.delete('/images/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const imageId = req.params.id;

  if (!userId) {
    return res.status(401).json({ message: 'Не авторизован' });
  }

  db.get('select * from Users where Id = ?', [userId], (err, user) => {
    if (!user || user.Role !== 1) {
      return res.status(403).json({ message: 'Нет прав' });
    }

    db.get('select * from Images where Id = ?', [imageId], (err, image) => {
      if (!image) {
        return res.status(404).json({ message: 'Картинка не найдена' });
      }

      const filePath = path.join(uploadDir, image.Filenshka);

      fs.unlink(filePath, () => {
        db.run('delete from Images where Id = ?', [imageId], err => {
          if (err) {
            return res.status(500).json({ message: 'Ошибка сервера' });
          }
          res.json({ message: 'Картинка удалена' });
        });
      });
    });
  });
});


const server = app.listen(3000, () => {
  console.log('http://localhost:3000');
});


const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('connection');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      
      if (data.type === 'auth') {
        const userId = data.userId;
        db.get("select * from Users where Id = ?", [userId], (err, user) => {
          if (user) {
            sessions.set(ws, user);
            ws.send(JSON.stringify({ type: 'auth', success: true, user }));
          } else {
            ws.send(JSON.stringify({ type: 'auth', success: false, message: 'Пользователь не найден((' }));
          }
        });
      }

      
      if (data.type === 'message') {
        const user = sessions.get(ws);
        if (!user) {
          ws.send(JSON.stringify({ type: 'error', message: 'Неавторизован' }));
          return;
        }

        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && sessions.has(client)) {
            client.send(JSON.stringify({
              type: 'message',
              from: user.Name,
              text: data.text,
              timestamp: Date.now()
            }));
          }
        });
      }

    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'не верный формат' }));
    }
  });

  ws.on('close', () => {
    sessions.delete(ws);
    console.log('соединение закрыто');
  });
});
