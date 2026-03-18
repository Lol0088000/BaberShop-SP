process.env.PORT = process.env.PORT || '3030';

const app = require('../server');
const port = Number(process.env.PORT || 3030);

app.listen(port, () => {
  console.log(`Servidor ativo em http://localhost:${port}`);
});
