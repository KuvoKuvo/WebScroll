<template>
  <div class="upload-container">
    <!-- Хедер -->
    <header class="main-header">
      <div class="header-left">
        <h1>📸 Фотогалерея</h1>
        <p class="welcome-text" v-if="user">Добро пожаловать, {{ user.name }}!</p>
      </div>
      <div class="header-right">
        <div class="user-info">
          <span class="user-name" v-if="user">{{ user.name }}</span>
          <button @click="logout" class="logout-button">
            <span class="logout-icon">🚪</span> Выйти
          </button>
        </div>
      </div>
    </header>

    <!-- Загрузка изображений -->
    <div v-if="isAdmin" class="upload-section">
      <h2>Загрузить изображение</h2>
      <div class="upload-controls">
        <input 
          type="file" 
          @change="handleFileChange" 
          accept="image/*" 
          id="fileInput"
          class="file-input"
        />
        <label for="fileInput" class="file-label">
          📁 Выбрать файл
        </label>
        <span v-if="selectedFile" class="file-name">{{ selectedFile.name }}</span>
        <button @click="uploadImage" :disabled="!selectedFile" class="upload-button">
          📤 Загрузить
        </button>
      </div>
      <p v-if="uploadMessage" class="upload-message">{{ uploadMessage }}</p>
    </div>

    <!-- Лента изображений -->
    <div class="images-container">
      <div class="images-grid-full">
        <div 
          v-for="image in images" 
          :key="image.Id" 
          class="image-card-full"
          @click="openImageModal(image)"
        >
          <div class="image-wrapper">
            <img 
              :src="`http://localhost:3000/uploads/${image.fileshka}`" 
              :alt="`Image by ${image.UserName}`"
              class="thumbnail-full"
              loading="lazy"
              @load="onImageLoad"
            />
            <div class="image-overlay">
              <div class="overlay-content">
                <div class="user-badge">
                  <span class="user-icon">👤</span>
                  <span class="user-name-small">{{ image.UserName }}</span>
                </div>
                <span class="view-text">Нажмите для просмотра</span>
              </div>
            </div>
          </div>
          <div class="image-info-full">
            <p class="image-author"><strong>{{ image.UserName }}</strong></p>
            <p class="image-date">{{ formatDate(image.UploadedAt) }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Модальное окно с изображением и комментариями -->
    <div v-if="selectedImage" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content dark-modal">
        <div class="modal-header">
          <h3>Просмотр фотографии</h3>
          <button @click="closeModal" class="close-modal-button">
            ✕
          </button>
        </div>
        
        <div class="modal-body">
          <!-- Изображение слева -->
          <div class="image-section">
            <div class="image-container">
              <img 
                :src="`http://localhost:3000/uploads/${selectedImage.fileshka}`" 
                :alt="`Image by ${selectedImage.UserName}`"
                class="modal-image"
                ref="modalImage"
                @load="centerModalImage"
              />
            </div>
            <div class="image-details">
              <div class="detail-item">
                <span class="detail-label">👤 Автор:</span>
                <span class="detail-value">{{ selectedImage.UserName }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">📅 Дата загрузки:</span>
                <span class="detail-value">{{ formatDate(selectedImage.UploadedAt) }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">💬 Комментариев:</span>
                <span class="detail-value">{{ comments.length }}</span>
              </div>
            </div>
          </div>

          <!-- Комментарии справа -->
          <div class="comments-section">
            <div class="comments-header">
              <h3>💬 Комментарии</h3>
              <span class="comments-count">{{ comments.length }}</span>
            </div>
            
            <div class="comments-list" ref="commentsList">
              <div v-if="comments.length === 0" class="no-comments">
                <p>Пока нет комментариев. Будьте первым!</p>
              </div>
              <div 
                v-for="comment in comments" 
                :key="comment.Id"
                class="comment-item"
              >
                <div class="comment-avatar">
                  {{ comment.UserName.charAt(0).toUpperCase() }}
                </div>
                <div class="comment-content">
                  <div class="comment-header">
                    <strong class="comment-author">{{ comment.UserName }}</strong>
                    <span class="comment-time">{{ formatTimeAgo(comment.CreatedAt) }}</span>
                  </div>
                  <p class="comment-text">{{ comment.Text }}</p>
                </div>
              </div>
            </div>

            <!-- Форма добавления комментария -->
            <div class="add-comment">
              <div class="comment-input-container">
                <textarea 
                  v-model="newComment" 
                  placeholder="Напишите комментарий..."
                  rows="3"
                  @keydown.enter.exact.prevent="addComment"
                  ref="commentInput"
                ></textarea>
                <button 
                  @click="addComment"
                  :disabled="!newComment.trim() || isAddingComment"
                  class="comment-button"
                >
                  <span v-if="isAddingComment" class="loading-spinner"></span>
                  <span v-else class="send-icon">✉️</span>
                  {{ isAddingComment ? 'Отправка...' : 'Отправить' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Кнопка закрытия -->
        <div class="modal-footer">
          <button @click="closeModal" class="back-button">
            ← Вернуться в ленту просмотра
          </button>
        </div>
      </div>
    </div>

    <!-- Уведомления -->
    <div v-if="message" class="notification">
      {{ message }}
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      images: [],
      selectedFile: null,
      uploadMessage: '',
      selectedImage: null,
      comments: [],
      newComment: '',
      message: '',
      ws: null,
      user: null,
      isAddingComment: false,
      currentImageId: null // Для отслеживания текущего изображения
    };
  },
  computed: {
    isAdmin() {
      return this.user && this.user.role === 1;
    }
  },
  mounted() {
    this.loadUser();
    this.fetchImages();
    this.setupWebSocket();
  },
  beforeUnmount() {
    if (this.ws) {
      this.ws.close();
    }
  },
  methods: {
    loadUser() {
      const userData = localStorage.getItem('user');
      if (userData) {
        this.user = JSON.parse(userData);
      } else {
        this.$router.push('/login');
      }
    },
    logout() {
      localStorage.removeItem('user');
      localStorage.removeItem('auth');
      if (this.ws) {
        this.ws.close();
      }
      this.$router.push('/login');
    },
    async fetchImages() {
      try {
        const res = await fetch('http://localhost:3000/images');
        const data = await res.json();
        if (res.ok) {
          this.images = data;
        } else {
          this.message = data.message || 'Ошибка загрузки изображений';
        }
      } catch (e) {
        this.message = 'Ошибка сети';
      }
    },
    handleFileChange(event) {
      this.selectedFile = event.target.files[0];
    },
    async uploadImage() {
      if (!this.selectedFile) return;
      
      const formData = new FormData();
      formData.append('image', this.selectedFile);
      
      try {
        const res = await fetch('http://localhost:3000/upload', {
          method: 'POST',
          headers: {
            'X-User-Id': this.user.id
          },
          body: formData
        });
        
        const data = await res.json();
        if (res.ok) {
          this.uploadMessage = '✅ Изображение успешно загружено!';
          this.selectedFile = null;
          document.getElementById('fileInput').value = '';
          this.fetchImages();
        } else {
          this.uploadMessage = '❌ ' + (data.message || 'Ошибка загрузки');
        }
      } catch (e) {
        this.uploadMessage = '❌ Ошибка сети';
      }
    },
    async openImageModal(image) {
      this.selectedImage = image;
      this.currentImageId = image.Id; // Сохраняем ID текущего изображения
      await this.fetchComments(image.Id);
      this.setupWebSocketSubscription(image.Id);
      this.scrollToTop();
      
      // Даем время на загрузку изображения
      setTimeout(() => {
        this.centerModalImage();
      }, 100);
    },
    scrollToTop() {
      if (this.$refs.commentsList) {
        this.$refs.commentsList.scrollTop = 0;
      }
    },
    closeModal() {
      this.selectedImage = null;
      this.comments = [];
      this.newComment = '';
      this.currentImageId = null;
      this.isAddingComment = false;
    },
    async fetchComments(imageId) {
      try {
        const res = await fetch(`http://localhost:3000/images/${imageId}/comments`);
        const data = await res.json();
        if (res.ok) {
          this.comments = data;
        }
      } catch (e) {
        console.error('Ошибка загрузки комментариев:', e);
      }
    },
    async addComment() {
      if (!this.newComment.trim() || !this.selectedImage || !this.user || this.isAddingComment) return;
      
      this.isAddingComment = true;
      const commentText = this.newComment.trim();
      
      try {
        const res = await fetch(`http://localhost:3000/images/${this.selectedImage.Id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: this.user.id,
            text: commentText
          })
        });
        
        const data = await res.json();
        if (res.ok) {
          // Очищаем поле ввода
          this.newComment = '';
          
          // Фокус на поле ввода
          if (this.$refs.commentInput) {
            this.$refs.commentInput.focus();
          }
        } else {
          this.message = data.message || 'Ошибка добавления комментария';
          setTimeout(() => this.message = '', 3000);
        }
      } catch (e) {
        this.message = 'Ошибка сети';
        setTimeout(() => this.message = '', 3000);
      } finally {
        this.isAddingComment = false;
      }
    },
    setupWebSocket() {
      this.ws = new WebSocket('ws://localhost:3000');
      
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({
          type: 'auth',
          userId: this.user.id
        }));
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'new-image') {
            this.images.unshift(data.image);
          }
          
          // ФИКС ДУБЛИРОВАНИЯ КОММЕНТАРИЕВ
          if (data.type === 'new-comment') {
            // Проверяем, что это комментарий для текущего изображения в модальном окне
            if (data.comment && data.comment.ImageId === this.currentImageId) {
              // Проверяем, нет ли уже такого комментария
              const commentExists = this.comments.some(c => c.Id === data.comment.Id);
              if (!commentExists) {
                this.comments.unshift(data.comment);
              }
            }
          }
          
        } catch (e) {
          console.error('Ошибка обработки WebSocket сообщения:', e);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
      };
    },
    setupWebSocketSubscription(imageId) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'subscribe-comments',
          imageId: imageId
        }));
      }
    },
    centerModalImage() {
      if (this.$refs.modalImage) {
        const img = this.$refs.modalImage;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
      }
    },
    onImageLoad(event) {
      // Унифицированный размер для всех изображений в ленте
      const img = event.target;
      const container = img.parentElement;
      
      // Устанавливаем фиксированный размер контейнера
      if (container) {
        container.style.height = '400px'; // Фиксированная высота
      }
      
      // Настраиваем изображение
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
    },
    formatDate(timestamp) {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    },
    formatTimeAgo(timestamp) {
      if (!timestamp) return '';
      const now = new Date();
      const date = new Date(timestamp);
      const diff = now - date;
      
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (minutes < 1) return 'только что';
      if (minutes < 60) return `${minutes} мин назад`;
      if (hours < 24) return `${hours} ч назад`;
      if (days < 7) return `${days} дн назад`;
      
      return date.toLocaleDateString('ru-RU');
    }
  }
};
</script>

<style scoped>
/* Общие стили */
.upload-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
  color: #fff;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* Хедер */
.main-header {
  background: rgba(20, 20, 20, 0.95);
  backdrop-filter: blur(10px);
  padding: 20px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-left h1 {
  margin: 0;
  font-size: 2rem;
  background: linear-gradient(45deg, #4a9eff, #6b46c1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.welcome-text {
  margin: 5px 0 0 0;
  color: #aaa;
  font-size: 0.9rem;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 15px;
  background: rgba(255, 255, 255, 0.1);
  padding: 10px 20px;
  border-radius: 50px;
  backdrop-filter: blur(5px);
}

.user-name {
  font-weight: 500;
}

.logout-button {
  background: linear-gradient(45deg, #ff4757, #ff3838);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 25px;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s;
}

.logout-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(255, 71, 87, 0.3);
}

.logout-icon {
  font-size: 1.1rem;
}

/* Секция загрузки */
.upload-section {
  max-width: 1200px;
  margin: 30px auto;
  padding: 30px;
  background: rgba(40, 40, 40, 0.7);
  border-radius: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid #444;
}

.upload-section h2 {
  margin-top: 0;
  color: #fff;
  margin-bottom: 20px;
}

.upload-controls {
  display: flex;
  gap: 15px;
  align-items: center;
  flex-wrap: wrap;
}

.file-input {
  display: none;
}

.file-label {
  background: linear-gradient(45deg, #4a9eff, #2a7bff);
  color: white;
  padding: 12px 24px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s;
}

.file-label:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(74, 158, 255, 0.3);
}

.file-name {
  color: #aaa;
  font-size: 0.9rem;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-button {
  background: linear-gradient(45deg, #00b894, #00a085);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s;
}

.upload-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0, 184, 148, 0.3);
}

.upload-button:disabled {
  background: #444;
  color: #777;
  cursor: not-allowed;
}

.upload-message {
  margin-top: 15px;
  padding: 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
}

/* Лента изображений */
.images-container {
  max-width: 100%;
  padding: 20px;
}

.images-grid-full {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
  justify-content: center;
}

.image-card-full {
  background: rgba(30, 30, 30, 0.8);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s;
  border: 1px solid #333;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  height: 450px; /* ФИКСИРОВАННАЯ ВЫСОТА ДЛЯ ВСЕХ КАРТОЧЕК */
}

.image-card-full:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  border-color: #4a9eff;
}

.image-wrapper {
  position: relative;
  width: 100%;
  height: 350px; /* ФИКСИРОВАННАЯ ВЫСОТА ДЛЯ ИЗОБРАЖЕНИЙ */
  overflow: hidden;
  flex-shrink: 0;
}

.thumbnail-full {
  width: 100%;
  height: 100%;
  object-fit: cover; /* ОБРЕЗКА ДЛЯ ЕДИНООБРАЗНОГО РАЗМЕРА */
  transition: transform 0.5s;
}

.image-card-full:hover .thumbnail-full {
  transform: scale(1.05);
}

.image-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
  padding: 20px;
  opacity: 0;
  transition: opacity 0.3s;
}

.image-card-full:hover .image-overlay {
  opacity: 1;
}

.overlay-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.7);
  padding: 8px 15px;
  border-radius: 20px;
}

.user-icon {
  font-size: 1.2rem;
}

.user-name-small {
  font-weight: 500;
}

.view-text {
  font-size: 0.9rem;
  color: #aaa;
}

.image-info-full {
  padding: 15px;
  background: rgba(40, 40, 40, 0.9);
  border-top: 1px solid #333;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.image-author {
  margin: 0 0 5px 0;
  font-size: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-date {
  margin: 0;
  color: #888;
  font-size: 0.85rem;
}

/* Модальное окно - ИСПРАВЛЕННЫЙ РАЗМЕР */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 10px;
}

.modal-content.dark-modal {
  background: #0f0f0f;
  border-radius: 15px;
  width: 95%;
  height: 95vh; 
  max-height: 95vh;
  display: flex;
  flex-direction: column;
  border: 1px solid #333;
  overflow: hidden;
}

.modal-header {
  padding: 15px 25px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  color: #fff;
  font-size: 1.2rem;
}

.close-modal-button {
  background: none;
  border: none;
  color: #aaa;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: 5px;
  transition: all 0.3s;
  line-height: 1;
}

.close-modal-button:hover {
  background: #333;
  color: #fff;
}

.modal-body {
  display: grid;
  grid-template-columns: 3fr 2fr;
  flex: 1;
  overflow: hidden;
  gap: 0;
  min-height: 0;
}

.image-section {
  padding: 20px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #333;
  overflow: hidden;
  min-height: 0;
}

.image-container {
  flex: 1;
  background: #000;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 15px;
  min-height: 0;
  max-height: calc(95vh - 200px);
}

.modal-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.image-details {
  background: #1a1a1a;
  border-radius: 8px;
  padding: 15px;
  flex-shrink: 0;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #333;
}

.detail-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.detail-label {
  color: #888;
  font-size: 0.9rem;
}

.detail-value {
  color: #fff;
  font-weight: 500;
  font-size: 0.9rem;
}

.comments-section {
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  overflow: hidden;
  min-height: 0;
}

.comments-header {
  padding: 15px 20px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.comments-header h3 {
  margin: 0;
  color: #fff;
  font-size: 1.1rem;
}

.comments-count {
  background: #4a9eff;
  color: white;
  padding: 3px 10px;
  border-radius: 15px;
  font-size: 0.8rem;
  font-weight: 500;
}

.comments-list {
  flex: 1;
  overflow-y: auto;
  padding: 15px 20px;
  min-height: 0;
}

.comments-list::-webkit-scrollbar {
  width: 6px;
}

.comments-list::-webkit-scrollbar-track {
  background: #222;
  border-radius: 10px;
}

.comments-list::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 10px;
}

.comments-list::-webkit-scrollbar-thumb:hover {
  background: #555;
}

.no-comments {
  text-align: center;
  padding: 30px 15px;
  color: #888;
  font-size: 0.9rem;
}

.comment-item {
  display: flex;
  gap: 12px;
  margin-bottom: 15px;
  padding: 15px;
  background: #222;
  border-radius: 8px;
  border-left: 3px solid #4a9eff;
}

.comment-avatar {
  width: 35px;
  height: 35px;
  background: linear-gradient(45deg, #4a9eff, #6b46c1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1rem;
  flex-shrink: 0;
}

.comment-content {
  flex: 1;
  min-width: 0;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.comment-author {
  color: #fff;
  font-weight: 500;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comment-time {
  font-size: 0.75rem;
  color: #888;
  flex-shrink: 0;
  margin-left: 10px;
}

.comment-text {
  margin: 0;
  line-height: 1.4;
  color: #d0d0d0;
  font-size: 0.9rem;
  word-break: break-word;
}

.add-comment {
  padding: 15px 20px;
  border-top: 1px solid #333;
  background: #222;
  flex-shrink: 0;
}

.comment-input-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comment-input-container textarea {
  width: 100%;
  padding: 12px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 8px;
  color: #fff;
  font-family: inherit;
  resize: none;
  transition: all 0.3s;
  font-size: 0.9rem;
  min-height: 70px;
  max-height: 150px;
}

.comment-input-container textarea:focus {
  outline: none;
  border-color: #4a9eff;
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
}

.comment-button {
  background: linear-gradient(45deg, #4a9eff, #2a7bff);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.3s;
  font-size: 0.9rem;
  height: 40px;
}

.comment-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(74, 158, 255, 0.3);
}

.comment-button:disabled {
  background: #444;
  color: #777;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.send-icon {
  font-size: 1rem;
}

.modal-footer {
  padding: 15px 25px;
  border-top: 1px solid #333;
  text-align: center;
  flex-shrink: 0;
}

.back-button {
  background: linear-gradient(45deg, #ff6b6b, #ff5252);
  color: white;
  border: none;
  padding: 10px 30px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.3s;
  width: 100%;
  max-width: 300px;
}

.back-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(255, 107, 107, 0.3);
}

.notification {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #333;
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  max-width: 250px;
  font-size: 0.9rem;
}

/* Адаптивность */
@media (max-width: 1024px) {
  .images-grid-full {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  }
  
  .image-card-full {
    height: 420px;
  }
  
  .image-wrapper {
    height: 320px;
  }
}

@media (max-width: 900px) {
  .modal-body {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }
  
  .image-section {
    border-right: none;
    border-bottom: 1px solid #333;
    max-height: 50vh;
  }
  
  .image-container {
    max-height: 40vh;
  }
  
  .modal-content.dark-modal {
    height: 90vh;
    max-height: 90vh;
  }
}

@media (max-width: 768px) {
  .images-grid-full {
    grid-template-columns: 1fr;
    max-width: 500px;
    margin: 0 auto;
  }
  
  .image-card-full {
    height: 450px;
  }
  
  .image-wrapper {
    height: 350px;
  }
  
  .upload-controls {
    flex-direction: column;
    align-items: stretch;
  }
  
  .file-label, .upload-button {
    width: 100%;
    text-align: center;
  }
  
  .user-info {
    width: 100%;
    justify-content: center;
  }
  
  .main-header {
    flex-direction: column;
    gap: 15px;
    text-align: center;
    padding: 15px 20px;
  }
  
  .header-left h1 {
    font-size: 1.5rem;
  }
}

@media (max-width: 576px) {
  .upload-section,
  .modal-content.dark-modal {
    padding: 15px;
    margin: 10px;
  }
  
  .image-card-full {
    height: 400px;
  }
  
  .image-wrapper {
    height: 300px;
  }
  
  .modal-overlay {
    padding: 5px;
  }
  
  .modal-content.dark-modal {
    width: 100%;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
  }
  
  .modal-header,
  .comments-header,
  .image-section,
  .comments-list,
  .add-comment,
  .modal-footer {
    padding: 12px 15px;
  }
  
  .comment-item {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .comment-avatar {
    margin-bottom: 8px;
  }
}
</style>