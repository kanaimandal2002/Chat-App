const net = require('net');
const readline = require('readline');

const client = new net.Socket();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

client.connect(3000, 'localhost', () => {
  console.log('Connected to chat server');
});

client.on('data', (data) => {
  console.log(data.toString());
});

client.on('close', () => {
  console.log('Connection closed');
});

rl.on('line', (input) => {
  client.write(input);
});
