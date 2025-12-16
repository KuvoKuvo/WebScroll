<template>
  <div class="main">
    <h2>Загрузка картинки</h2>

    <input type="file" @change="showFileshka" />
    <p>{{ fileshka ? fileshka.name : '' }}</p>

    <button @click="uploadFileshka" :disabled="!fileshka">Загрузить</button>
    <button @click="logout">Выйти</button>

    <p v-if="message">{{ message }}</p>

    <hr />

    <h2>Лента картинок</h2>
    <div class="gallery">
      <div v-for="image in images" :key="image.Id" class="image-card">
        <img :src="`http://localhost:3000/uploads/${image.fileshka}`" alt="image" />
        <p class="username">{{ image.UserName }}</p>
        <button v-if="user && user.role === 1" @click="deleteImage(image.Id)">
          Удалить
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      fileshka: null,
      message: '',
      images: [],
      socket: null,
      user: JSON.parse(localStorage.getItem('user')) || null
    };
  },

  mounted() {
    this.loadImages();
    this.initSocket();
  },

  methods: {
    logout() {
      localStorage.removeItem('user');
      localStorage.removeItem('auth');
      this.$router.push('/login');
    },

    showFileshka(event) {
      const file = event.target.files[0];
      this.fileshka = file || null;
      this.message = '';
    },

    async uploadFileshka() {
  if (!this.fileshka) return;

  if (!this.user) {
    this.message = 'Вы не авторизованы';
    return;
  }

  const formData = new FormData();
  formData.append('image', this.fileshka);

  try {
    const res = await fetch('http://localhost:3000/upload', {
      method: 'POST',
      headers: { 'x-user-id': this.user.id },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      this.message = data.message || 'Ошибка загрузки';
      return;
    }

    this.message = 'Картинка загружена';
    this.fileshka = null;

   

  } catch (err) {
    this.message = 'Ошибка сети';
  }
},
    async loadImages() {
      try {
        const res = await fetch('http://localhost:3000/images');
        const data = await res.json();
        if (res.ok || res.status === 200) this.images = data;
      } catch (e) {
        console.error(e);
      }
    },

    async deleteImage(imageId) {
      if (!this.user) return;

      try {
        const res = await fetch(`http://localhost:3000/images/${imageId}`, {
          method: 'DELETE',
          headers: { 'x-user-id': this.user.id }
        });

        const data = await res.json();

        if (!res.ok) {
          this.message = data.message || 'Ошибка удаления';
          return;
        }

        
        this.images = this.images.filter(img => img.Id !== imageId);
        this.message = 'Картинка удалена';
      } catch (err) {
        this.message = 'Ошибка сети';
      }
    },

    initSocket() {
      this.socket = new WebSocket('ws://localhost:3000');

      this.socket.onopen = () => {
        console.log('WebSocket подключен');


        if (this.user) {
          this.socket.send(JSON.stringify({ type: 'auth', userId: this.user.id }));
        }
      };

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        
        if (data.type === 'new-image') {
          this.images.unshift(data.image);
        }
      };

      this.socket.onclose = () => {
        console.log('WebSocket отключен');
      };
    }
  }
};
</script>

<style scoped>
.main {
  margin: 15px;
}

.gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.image-card {
  width: 300px;
  height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

.image-card img {
  width: 300px;
  height: 300px;
  object-fit: cover;
  border-radius: 12px;
}

.username {
  margin-top: 5px;
  font-weight: bold;
}

.image-card button {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 5px 10px;
  background-color: red;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

.image-card button:hover {
  background-color: darkred;
}
</style>
