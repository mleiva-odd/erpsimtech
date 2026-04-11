
const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:postgres@localhost:65432/simtechdb'
});

client.connect()
  .then(() => {
    console.log('SUCCESS: Connected to postgres on 65432');
    process.exit(0);
  })
  .catch(err => {
    console.error('FAILED to connect:', err.message);
    process.exit(1);
  });
