import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Loopback only, so `npm run dev` prints the one Local URL and nothing
    // else. `host: true` binds every interface and adds a Network line per
    // adapter — which is what a staff member on another machine needs to
    // reach an emailed link, and what to set again if that is ever wanted
    // back. It also has to agree with VITE_API_BASE_URL in .env: the page and
    // the API it calls are named by the same host.
    host: 'localhost',
    port: 5173,
    // Fail if 5173 is taken, rather than quietly moving to 5174. `port` on
    // its own is only a preference — a dev server left running in another
    // terminal is enough to make the next `npm run dev` pick a different one,
    // and nothing announces that beyond one line of startup output.
    //
    // Drifting is not harmless here, because the port is written down on the
    // backend as well: dev.ini pins cors_origins and frontend_base_url to
    // :5173, so a frontend on :5174 has every API call refused by CORS, and
    // every password-reset link the portal emails points at a port with
    // nothing behind it. Better to be told the port is busy and close the
    // other server than to debug that.
    strictPort: true,
  },
})
