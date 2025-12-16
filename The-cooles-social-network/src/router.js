import { createRouter, createWebHistory } from 'vue-router';
import Auth from '@/AuthPage.vue';
import Register from '@/RegistrationPage.vue';
import Upload from '@/Upload.vue'; 

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: Auth },
  { path: '/register', component: Register },
  { path: '/upload', component: Upload }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const isAuth = !!(user && user.id);

  if (to.path === '/upload' && !isAuth) {
    next('/login');
  } else if ((to.path === '/login' || to.path === '/register') && isAuth) {
    next('/upload');
  } else {
    next();
  }
});

export default router;