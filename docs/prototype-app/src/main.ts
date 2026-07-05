import { createApp } from 'vue';

import App from './App.vue';
import { overflowTitleDirective } from './directives/overflow-title';
import './styles/global.css';

createApp(App).directive('overflow-title', overflowTitleDirective).mount('#app');
