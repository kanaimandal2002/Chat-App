const net = require('net');

const clients = [];
let clientCounter = 1; // to assign unique client IDs

const server = net.createServer((socket) => {
  const clientId = clientCounter++;
  const clientName = `Client ${clientId}`;
  socket.clientName = clientName;

  console.log(`${clientName} connected`);
  socket.write(`Welcome ${clientName}!\n`);
  clients.push(socket);

  socket.on('data', (data) => {
    const message = data.toString().trim();
    console.log(`Received message from ${clientName}: ${message}`);

    // Broadcast to other clients
    for (let client of clients) {
      if (client !== socket) {
        client.write(`${clientName}: ${message}\n`);
      }
    }
  });

  socket.on('end', () => {
    console.log(`${clientName} disconnected`);
    clients.splice(clients.indexOf(socket), 1);
  });

  socket.on('error', (err) => {
    console.error(`${clientName} error: ${err.message}`);
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Chat server started on port ${PORT}`);
});
