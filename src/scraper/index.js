// src/scraper/index.js
const sitesConfig = require('./sites.config');

async function runAllScrapers() {
    console.log("Iniciando orquestrador de scrapers...");
    let allScrapedEpisodes = [];

    // Itera sobre cada site configurado
    for (const site of sitesConfig) {
        console.log(`--- Executando parser para: ${site.name} ---`);
        try {
            // Chama a função de parser específica do site
            const results = await site.parser(site.entryUrl);
            
            // Adiciona os resultados ao array geral
            allScrapedEpisodes = allScrapedEpisodes.concat(results);
            console.log(`--- Parser para ${site.name} finalizado. Encontrados ${results.length} itens. ---`);
        } catch (error) {
            // Se um parser falhar, loga o erro e continua para o próximo
            console.error(`!!!!!! Erro crítico no parser de ${site.name}. Pulando para o próximo. !!!!!!`, error);
        }
    }

    console.log(`\nOrquestrador finalizado. Total de itens raspados de todas as fontes: ${allScrapedEpisodes.length}`);
    return allScrapedEpisodes;
}

module.exports = { runAllScrapers };