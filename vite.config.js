import {portraitBackend} from './backend/plugin.mjs';
export default {
  plugins:[portraitBackend()],
  build:{rolldownOptions:{input:{main:'index.html',inkscape:'inkscape.html'}}},
  // Watch backend JS (a config dependency) so prompt/API edits restart the server.
  // Ignore generated files and large archives, which Windows can lock during downloads.
  server: {fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.private/**','**/.venv/**']},watch: {ignored: ['**/.private/**','**/.venv/**', '**/backend/**/__pycache__/**', '**/backend/vendor/**', '**/output/**', '**/examples/**', '**/test-results/**', '**/playwright-report/**']}},
};
