const express = require('express');
const router = express.Router();

const precos = {
  teste_prosperidade: {
    preco_avista: "19,01"
  }
};

router.get('/precos', (req, res) => {
  res.json(precos);
});

module.exports = router;
