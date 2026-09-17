import 'dotenv/config';
import { loadConfig } from './config.js';
import { connectDatabase } from './database.js';
import { createApp } from './app.js';
const config = loadConfig();
const { client, db } = await connectDatabase(config);
const { app, files } = createApp({ client, db, config });
await files.recover();
const recovery = setInterval(
  () => void files.recover().catch((error) => console.error('Recovery failed', error.message)),
  60000,
);
recovery.unref();
const server = app.listen(config.PORT, '0.0.0.0', () =>
  console.log(`Drive listening on port ${config.PORT}`),
);
server.requestTimeout = 120000;
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    clearInterval(recovery);
    server.close(() => {
      void client.close().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 15000).unref();
  });
