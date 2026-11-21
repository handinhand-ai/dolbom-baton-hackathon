import { createApp } from './apps/api/src/server.mjs';

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
server.listen(port, '0.0.0.0', () => {
  console.log(`Dolbom Baton server listening on ${port}`);
});

export default server;
