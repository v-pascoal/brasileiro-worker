// run-local-worker.js

// Importa a função principal do nosso worker
const workerHandler = require('./api/worker');

console.log("===================================");
console.log("🚀 INICIANDO EXECUÇÃO LOCAL DO WORKER 🚀");
console.log("===================================");

// Função auto-executável para podermos usar async/await
(async () => {
    try {
        // Simula os objetos 'request' e 'response' que a Vercel enviaria.
        // Para um cron job, o 'request' é praticamente vazio.
        const mockRequest = {};

        // O objeto 'response' precisa de métodos para não quebrar o código do handler.
        // Fazemos com que ele imprima a resposta no console.
        const mockResponse = {
            statusCode: 200, // Default status code
            status: function(code) {
                this.statusCode = code;
                return this; // Permite encadear chamadas, ex: res.status(200).json(...)
            },
            json: function(data) {
                console.log("\n✅ Worker finalizou com sucesso!");
                console.log(`   - Status: ${this.statusCode}`);
                console.log("   - Resposta:", data);
            }
        };

        // Chama o handler do worker com os objetos simulados
        await workerHandler(mockRequest, mockResponse);

    } catch (error) {
        console.error("\n❌ Ocorreu um erro catastrófico durante a execução local:", error);
    } finally {
        console.log("\n===================================");
        console.log("✨ EXECUÇÃO LOCAL FINALIZADA ✨");
        console.log("===================================");
        
        // Importante: precisamos fechar a conexão com o banco de dados
        // para que o script termine de rodar.
        const db = require('./src/database');
        db.query('SELECT 1').then(() => {
            const { Pool } = require('pg');
            const pool = new Pool({ connectionString: process.env.DATABASE_URL });
            pool.end(); // Fecha todas as conexões do pool
        });
    }
})();