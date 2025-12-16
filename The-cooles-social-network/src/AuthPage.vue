<template>
  <div class="auth-container">
    <h2>Авторизация</h2>

    <form @submit.prevent="login">
      <div>
        <label for="mail">Email:</label>
        <input type="email" id="mail" v-model="Mail" required />
      </div>

      <div>
        <label for="password">Пароль:</label>
        <input type="password" id="password" v-model="Password" required />
      </div>

      <button type="submit">Войти</button>
    </form>

    <p class="message" v-if="message">{{ message }}</p>

    <p>
      Нет аккаунта?
      <router-link to="/register">Зарегистрироваться</router-link>
    </p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      Mail: '',
      Password: '',
      message: ''
    };
  },
  methods: {
    async login() {
      if (!this.Mail || !this.Password) {
        this.message = 'Заполните все поля';
        return;
      }

      try {
        const res = await fetch('http://localhost:3000/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Mail: this.Mail, Password: this.Password })
        });

        const data = await res.json();

        if (res.ok) {
          this.message = '';
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('auth', 'true');
          this.$router.push('/upload');
        } else {
          this.message = data.message || 'Ошибка авторизации';
        }
      } catch (e) {
        this.message = 'Ошибка сети';
      }
    }
  }
};
</script>

<style scoped>
.auth-container {
  margin: 30px;
  max-width: 400px;
}
input {
  display: block;
  width: 100%;
  margin-bottom: 10px;
  padding: 6px;
}
button {
  padding: 6px 12px;
}
.message {
  color: red;
}
</style>
