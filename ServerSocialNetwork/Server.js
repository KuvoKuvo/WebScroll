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
          UploadedAt: Date.now(),
          likeCount: 0,
          userLiked: false
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

// Получение всех изображений (с лайками)
app.get('/images', (req, res) => {
  const userId = req.headers['x-user-id'];
  
  const query = `
    SELECT
      Images.Id,
      Images.Filenshka AS fileshka,
      Images.UserId,
      Users.Name AS UserName,
      Images.UploadedAt,
      (SELECT COUNT(*) FROM Likes WHERE Likes.ImageId = Images.Id) as likeCount
    FROM Images
    LEFT JOIN Users ON Users.Id = Images.UserId
    ORDER BY Images.UploadedAt DESC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }
    
    if (userId) {
      const imageIds = rows.map(row => row.Id);
      if (imageIds.length > 0) {
        const placeholders = imageIds.map(() => '?').join(',');
        db.all(
          `SELECT ImageId FROM Likes WHERE UserId = ? AND ImageId IN (${placeholders})`,
          [userId, ...imageIds],
          (err, userLikes) => {
            if (err) {
              console.error(err);
              return res.status(500).json({ message: 'Ошибка сервера' });
            }
            
            const likedImageIds = new Set(userLikes.map(like => like.ImageId));
            
            rows.forEach(row => {
              row.userLiked = likedImageIds.has(row.Id);
            });
            
            res.json(rows);
          }
        );
      } else {
        res.json(rows);
      }
    } else {
      rows.forEach(row => {
        row.userLiked = false;
      });
      res.json(rows);
    }
  });
});

// Получение информации о лайках для конкретного изображения
app.get('/images/:id/likes', (req, res) => {
  const imageId = req.params.id;
  const userId = req.headers['x-user-id'];
  
  db.get('SELECT COUNT(*) as count FROM Likes WHERE ImageId = ?', [imageId], (err, totalResult) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }

    if (userId) {
      db.get('SELECT Id FROM Likes WHERE ImageId = ? AND UserId = ?', [imageId, userId], (err, userLike) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Ошибка сервера' });
        }
        
        res.json({
          totalLikes: totalResult.count,
          userLiked: !!userLike,
          likeId: userLike ? userLike.Id : null
        });
      });
    } else {
      res.json({
        totalLikes: totalResult.count,
        userLiked: false,
        likeId: null
      });
    }
  });
});

// Добавление/удаление лайка
app.post('/images/:id/like', (req, res) => {
  const imageId = req.params.id;
  const userId = req.body.userId;
  
  if (!userId) {
    return res.status(401).json({ message: 'Не авторизован' });
  }
  
  db.get('SELECT Id FROM Images WHERE Id = ?', [imageId], (err, image) => {
    if (!image) {
      return res.status(404).json({ message: 'Изображение не найдено' });
    }
    
    db.get('SELECT Id FROM Likes WHERE ImageId = ? AND UserId = ?', [imageId, userId], (err, existingLike) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ошибка сервера' });
      }
      
      if (existingLike) {
        db.run('DELETE FROM Likes WHERE Id = ?', [existingLike.Id], function(err) {
          if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Ошибка сервера' });
          }
          
          db.get('SELECT COUNT(*) as count FROM Likes WHERE ImageId = ?', [imageId], (err, result) => {
            if (err) {
              console.error(err);
              return res.status(500).json({ message: 'Ошибка сервера' });
            }
            
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'like-updated',
                  imageId: imageId,
                  totalLikes: result.count,
                  action: 'unlike'
                }));
              }
            });
            
            res.json({
              message: 'Лайк удален',
              liked: false,
              totalLikes: result.count
            });
          });
        });
      } else {
        db.run(
          'INSERT INTO Likes (ImageId, UserId, CreatedAt) VALUES (?, ?, ?)',
          [imageId, userId, Date.now()],
          function(err) {
            if (err) {
              console.error(err);
              return res.status(500).json({ message: 'Ошибка сервера' });
            }
            
            db.get('SELECT COUNT(*) as count FROM Likes WHERE ImageId = ?', [imageId], (err, result) => {
              if (err) {
                console.error(err);
                return res.status(500).json({ message: 'Ошибка сервера' });
              }
              
              wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'like-updated',
                    imageId: imageId,
                    totalLikes: result.count,
                    action: 'like'
                  }));
                }
              });
              
              res.json({
                message: 'Лайк добавлен',
                liked: true,
                totalLikes: result.count
              });
            });
          }
        );
      }
    });
  });
});

// Получение списка пользователей, поставивших лайк (опционально)
app.get('/images/:id/likes-list', (req, res) => {
  const imageId = req.params.id;
  
  db.all(`
    SELECT 
      Likes.Id,
      Likes.UserId,
      Users.Name as UserName,
      Likes.CreatedAt
    FROM Likes
    LEFT JOIN Users ON Users.Id = Likes.UserId
    WHERE Likes.ImageId = ?
    ORDER BY Likes.CreatedAt DESC
    LIMIT 50
  `, [imageId], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Ошибка сервера' });
    }
    res.json(rows);
  });
});

// Удаление изображения
db.run('delete from Images where Id = ?', [imageId], err => {
  if (err) {
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'deleted-image',
        imageId: imageId
      }));
    }
  });
  
  res.json({ message: 'Картинка удалена' });
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

const server = app.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Новое WebSocket соединение');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

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

      if (data.type === 'subscribe-comments') {
        const { imageId } = data;
        ws.subscribedImageId = imageId;
      }

      if (data.type === 'like-updated') {
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'like-updated',
              imageId: data.imageId,
              totalLikes: data.totalLikes,
              action: data.action
            }));
          }
        });
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