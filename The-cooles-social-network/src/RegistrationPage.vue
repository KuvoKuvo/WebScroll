<template>
  <div class="auth-container">
    <h2>Регистрация</h2>

    <form @submit.prevent="register">
      <div>
        <label for="name">Имя:</label>
        <input type="text" id="name" v-model="Name" required />
      </div>

      <div>
        <label for="mail">Email:</label>
        <input type="email" id="mail" v-model="Mail" required />
      </div>

      <div>
        <label for="password">Пароль:</label>
        <input type="password" id="password" v-model="Password" required />
      </div>

      <button type="submit">Зарегистрироваться</button>
    </form>

    <p class="message" v-if="message">{{ message }}</p>

    <p>
      Уже есть аккаунт?
      <router-link to="/login">Войти</router-link>
    </p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      Name: '',
      Mail: '',
      Password: '',
      message: ''
    };
  },
  methods: {
    async register() {
      if (!this.Name || !this.Mail || !this.Password) {
        this.message = 'Заполните все поля';
        return;
      }

      try {
        const res = await fetch('http://localhost:3000/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Name: this.Name, Mail: this.Mail, Password: this.Password })
        });

        const data = await res.json();

        if (res.ok) {
          this.message = 'Регистрация успешна!';
          setTimeout(() => this.$router.push('/login'), 1500);
        } else {
          this.message = data.message || 'Ошибка регистрации';
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
