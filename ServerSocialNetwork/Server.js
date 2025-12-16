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

// Подключаем базу данных
const db = new sqlite3.Database('этоБаза.db', (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err);
  } else {
    console.log('Подключено к SQLite базе данных');
    
    // Создаем таблицу Comments если ее нет
    db.run(`
      CREATE TABLE IF NOT EXISTS Comments (
        Id INTEGER PRIMARY KEY AUTOINCREMENT,
        ImageId INTEGER,
        UserId INTEGER,
        Text TEXT,
        CreatedAt INTEGER,
        FOREIGN KEY (ImageId) REFERENCES Images(Id) ON DELETE CASCADE,
        FOREIGN KEY (UserId) REFERENCES Users(Id)
      )
    `, (err) => {
      if (err) {
        console.error('Ошибка создания таблицы Comments:', err);
      } else {
        console.log('Таблица Comments создана/проверена');
      }
    });
  }
});

const sessions = new Map();

app.use('/uploads', express.static(uploadDir));

// Регистрация
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

// Авторизация
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

// Загрузка изображения
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

        // Отправляем через WebSocket всем клиентам
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

// Получение всех изображений
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

// Удаление изображения
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

// Получение комментариев к изображению
app.get('/images/:id/comments', (req, res) => {
  const imageId = req.params.id;
  
  db.all(`
    SELECT 
      Comments.*,
      Users.Name as UserName
    FROM Comments
    LEFT JOIN Users ON Users.Id = Comments.UserId
    WHERE Comments.ImageId = ?
    ORDER BY Comments.CreatedAt DESC
  `, [imageId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }
    res.json(rows);
  });
});

// Добавление комментария
app.post('/images/:id/comments', (req, res) => {
  const imageId = req.params.id;
  const { userId, text } = req.body;
  
  if (!userId || !text || !text.trim()) {
    return res.status(400).json({ message: 'Заполните все поля' });
  }
  
  db.run(
    `INSERT INTO Comments (ImageId, UserId, Text, CreatedAt) 
     VALUES (?, ?, ?, ?)`,
    [imageId, userId, text.trim(), Date.now()],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ошибка сервера' });
      }
      
      // Получаем созданный комментарий с именем пользователя
      db.get(`
        SELECT 
          Comments.*,
          Users.Name as UserName
        FROM Comments
        LEFT JOIN Users ON Users.Id = Comments.UserId
        WHERE Comments.Id = ?
      `, [this.lastID], (err, comment) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Ошибка сервера' });
        }
        
        // Отправляем комментарий через WebSocket всем клиентам
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'new-comment',
              comment: comment
            }));
          }
        });
        
        res.json({ 
          message: 'Комментарий добавлен', 
          comment: comment 
        });
      });
    }
  );
});

// Запуск сервера
const server = app.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});

// WebSocket сервер
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Новое WebSocket соединение');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Аутентификация через WebSocket
      if (data.type === 'auth') {
        const userId = data.userId;
        db.get("select * from Users where Id = ?", [userId], (err, user) => {
          if (user) {
            sessions.set(ws, user);
            ws.userId = userId;
            ws.send(JSON.stringify({ type: 'auth', success: true, user }));
          } else {
            ws.send(JSON.stringify({ type: 'auth', success: false, message: 'Пользователь не найден' }));
          }
        });
      }

      // Отправка сообщения (комментария)
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

      // Подписка на комментарии для конкретного изображения
      if (data.type === 'subscribe-comments') {
        const { imageId } = data;
        ws.subscribedImageId = imageId;
      }

    } catch (e) {
      console.error('Ошибка обработки WebSocket сообщения:', e);
      ws.send(JSON.stringify({ type: 'error', message: 'не верный формат' }));
    }
  });

  ws.on('close', () => {
    sessions.delete(ws);
    console.log('WebSocket соединение закрыто');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket ошибка:', error);
  });
});
