import { createApp } from './server.mjs';

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

const server = createApp();
server.on('error', (error) => {
  console.error(`Server failed to start: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Local skeleton available at http://127.0.0.1:${port}`);
});
