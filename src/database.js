const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Necessário para conexões com Heroku, Neon, etc.
    }
});

module.exports = {
    // Função para executar queries de forma segura
    query: (text, params) => pool.query(text, params),
};