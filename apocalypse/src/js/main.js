import { App } from './ui/app.js';

const app = new App();
window.cyoa = app; // handy for debugging in the console
app.init().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#ff6b6b;padding:20px">Startup error: ${err.message}</pre>`);
});
