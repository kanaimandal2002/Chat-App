const net = require('net');

const clients = [];
let clientCounter = 1;

const server = net.createServer((socket) => {
  const clientId = clientCounter++;
  const clientName = `Client ${clientId}`;
  socket.clientName = clientName;

  console.log(`${clientName} connected`);
  socket.write(`Welcome ${clientName}!\n`);
  clients.push(socket);

  // Flag to avoid double-logging disconnect on error + end
  let disconnected = false;

  socket.on('data', (data) => {
    const message = data.toString().trim();
    console.log(`Received message from ${clientName}: ${message}`);

    for (let client of clients) {
      if (client !== socket) {
        client.write(`${clientName}: ${message}\n`);
      }
    }
  });

  socket.on('end', () => {
    if (!disconnected) {
      disconnected = true;
      console.log(`${clientName} disconnected`);
      clients.splice(clients.indexOf(socket), 1);
    }
  });

  socket.on('error', (err) => {
    if (!disconnected) {
      disconnected = true;
      console.log(`${clientName} disconnected`);
      clients.splice(clients.indexOf(socket), 1);
      // Optional: log actual error silently
      // console.error(`${clientName} error: ${err.message}`);
    }
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Chat server running on port ${PORT}`);
});
