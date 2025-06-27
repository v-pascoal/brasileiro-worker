const axios = require('axios');
require('dotenv').config();

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_API_URL = 'https://api.themoviedb.org/3';

async function findStremioId(title) {
    console.log(`Enriquecendo título: "${title}"`);
    try {
        const searchUrl = `${TMDB_API_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
        const { data } = await axios.get(searchUrl);

        if (data.results && data.results.length > 0) {
            // Pega o primeiro resultado (aqui você pode adicionar lógicas mais inteligentes)
            const tmdbId = data.results[0].id;
            
            // Para séries, o TMDB ID pode ser usado para encontrar o IMDb ID
            const externalIdsUrl = `${TMDB_API_URL}/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
            const { data: externalIds } = await axios.get(externalIdsUrl);

            // Stremio usa IMDb ID para séries e Kitsu ID para animes.
            // O Cinemeta está migrando para TMDB IDs, mas IMDb ainda é seguro.
            // Para animes, o processo pode ser mais complexo (ex: TMDB -> TVDB -> Kitsu).
            // Vamos usar o IMDb ID por enquanto.
            if (externalIds.imdb_id) {
                console.log(`ID encontrado para "${title}": ${externalIds.imdb_id}`);
                return externalIds.imdb_id; // Retorna no formato 'tt123456'
            }
        }
        console.warn(`Nenhum ID encontrado para "${title}"`);
        return null;

    } catch (error) {
        console.error(`Erro ao enriquecer "${title}":`, error.message);
        return null;
    }
}

module.exports = { findStremioId };