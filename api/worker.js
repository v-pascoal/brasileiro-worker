const db = require('../src/database');
// Importa o novo orquestrador em vez do scraper antigo
const { runAllScrapers } = require('../src/scraper');
const { findStremioId } = require('../src/enricher');

module.exports = async function handler(request, response) {
    console.log("CRON JOB INICIADO: Iniciando processo de worker.");

    try {
        // 1. Raspar os dados de TODOS os sites configurados
        const episodes = await runAllScrapers();

        if (episodes.length === 0) {
            console.log("Nenhum episódio encontrado. Finalizando o job.");
            return response.status(200).json({ message: "Nenhum episódio novo encontrado." });
        }

        // AGORA O DESAFIO: Como agrupar episódios por anime para não buscar o ID toda vez?
        const episodesByAnime = episodes.reduce((acc, ep) => {
            acc[ep.animeTitle] = acc[ep.animeTitle] || [];
            acc[ep.animeTitle].push(ep);
            return acc;
        }, {});

        let totalNewStreams = 0;

        // Itera sobre cada TÍTULO de anime encontrado
        for (const animeTitle in episodesByAnime) {
            console.log(`Processando anime: ${animeTitle}`);
            const stremioId = await findStremioId(animeTitle);

            if (!stremioId) {
                console.warn(`Não foi possível encontrar um Stremio ID para "${animeTitle}". Pulando ${episodesByAnime[animeTitle].length} episódios.`);
                continue; // Pula para o próximo anime
            }

            // Agora itera sobre os episódios DAQUELE anime
            for (const episode of episodesByAnime[animeTitle]) {
                const streamTitle = `${episode.animeTitle} Ep ${episode.episodeNumber} - Dublado`;
                
                // CORREÇÃO: Use a chave 'streamUrl' retornada pelo parser.
                const videoUrl = episode.streamUrl; 
                
                const insertQuery = `
                    INSERT INTO streams.animes (stremio_id, season_number, episode_number, stream_title, stream_data)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (stremio_id, season_number, episode_number) DO NOTHING;
                `;
                const values = [stremioId, episode.seasonNumber, episode.episodeNumber, streamTitle, videoUrl];

                const result = await db.query(insertQuery, values);
                if (result.rowCount > 0) {
                    totalNewStreams++;
                }
            }
        }
        
        const message = `CRON JOB FINALIZADO: ${totalNewStreams} novos streams foram adicionados.`;
        console.log(message);
        return response.status(200).json({ message });

    } catch (error) {
        console.error("Erro fatal no Cron Job:", error);
        return response.status(500).json({ error: 'Ocorreu um erro interno no worker.' });
    }
}