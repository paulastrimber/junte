import { createApp } from './app.js';
import { config } from './config/index.js';

createApp().listen(config.port, () => {
  console.log(`junte-backend escuchando en :${config.port}`);
});
