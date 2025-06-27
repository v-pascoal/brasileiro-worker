// src/scraper/parsers/site_animes_drive_parser.js
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url'); // Módulo nativo do Node.js para lidar com URLs

// Atraso entre requisições para não sobrecarregar o servidor
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Função auxiliar para raspar a página de detalhes de um único anime,
 * agora com a estrutura HTML correta que você forneceu.
 * @param {string} animePageUrl - A URL da página do anime
 * @returns {Promise<Array>} - Lista de episódios com { animeTitle, seasonNumber, episodeNumber, streamUrl }
 */
async function scrapeAnimeDetailPage(animePageUrl) {
    let episodes = [];
    try {
        console.log(`   -> [DETALHE] Raspando: ${animePageUrl}`);
        const { data: detailHtml } = await axios.get(animePageUrl);
        const $ = cheerio.load(detailHtml);

        // Extrai o título do anime da página de detalhes.
        const animeTitle = $('div.sheader div.data > h1').text().trim();
        if (!animeTitle) {
            console.warn(`      -> Título do anime não encontrado em ${animePageUrl}. Pulando.`);
            return [];
        }

        // Itera sobre cada bloco de temporada (cada div.se-c)
        $('#episodes div.se-c').each((seasonIndex, seasonElement) => {
            const seasonTitle = $(seasonElement).find('.se-q .title').text();
            
            // Tenta extrair o número da temporada. Assume 1 se não encontrar.
            const seasonMatch = seasonTitle.match(/Temporada\s*-\s*(\d+)/i);
            // Se não for "Temporada - X", pega o primeiro número que encontrar no título.
            const seasonNumberMatch = $(seasonElement).find('.se-q .se-t').text().trim().match(/^(\d+)$/);
            
            let seasonNumber = 1; // Default
            if (seasonMatch) {
                seasonNumber = parseInt(seasonMatch[1], 10);
            } else if (seasonNumberMatch) {
                seasonNumber = parseInt(seasonNumberMatch[1], 10);
            }

            // Itera sobre cada episódio (li) dentro da temporada
            $(seasonElement).find('ul.episodios li').each((epIndex, epElement) => {
                const episodeLinkElement = $(epElement).find('.episodiotitle a');
                const episodePageUrl = episodeLinkElement.attr('href');

                // Extrai o número do episódio do texto 'numerando'
                const episodeNumberText = $(epElement).find('.numerando').text(); // Ex: '1 - 1' ou 'ep - 33'
                const episodeNumberMatch = episodeNumberText.match(/(\d+)$/); // Pega o último número

                if (episodePageUrl && episodeNumberMatch) {
                    const episodeNumber = parseInt(episodeNumberMatch[0], 10);
                    
                    // Adicionamos um marcador para ser processado depois.
                    // Não fazemos a requisição do vídeo aqui para manter a agilidade.
                    episodes.push({
                        animeTitle,
                        seasonNumber,
                        episodeNumber,
                        // URL da página do episódio que contém o iframe do player
                        sourcePageUrl: episodePageUrl 
                    });
                }
            });
        });

    } catch (error) {
        console.error(`      -> [ERRO DETALHE] Falha ao raspar ${animePageUrl}:`, error.message);
    }
    return episodes;
}

/**
 * Função auxiliar para visitar a página do episódio e extrair a URL final do vídeo .mp4
 * @param {string} episodePageUrl - A URL da página do episódio.
 * @returns {Promise<string|null>} - A URL direta do vídeo, ou null se não encontrar.
 */
async function extractVideoStreamUrl(episodePageUrl) {
    try {
        const { data: playerPageHtml } = await axios.get(episodePageUrl);
        const $ = cheerio.load(playerPageHtml);

        const iframeSrc = $('iframe.metaframe.rptss').attr('src');
        if (!iframeSrc) return null;

        // O iframeSrc contém a URL do vídeo encodada. Vamos decodificá-la.
        const urlParams = new URL(iframeSrc).searchParams;
        const videoUrl = urlParams.get('source'); // Pega o valor do parâmetro 'source'

        return videoUrl; // Ex: "https://eos.feralhosting.com/.../1132.mp4"

    } catch (error) {
        console.error(`      -> [ERRO VÍDEO] Falha ao extrair stream de ${episodePageUrl}:`, error.message);
        return null;
    }
}

/**
 * Função principal do parser.
 * Gera todas as URLs de paginação, raspa as listas de anime e depois os detalhes.
 * @param {string} entryUrl - A URL inicial
 * @returns {Promise<Array>}
 */
async function parse(entryUrl) {
    console.log(`[Animes Drive Parser] Iniciando em: ${entryUrl}`);
    let allAnimePageLinks = [];
    const pageUrlsToScrape = [];

    // 1. Descobrir o número total de páginas e gerar todas as URLs da lista
    try {
        console.log('[Animes Drive Parser] Detectando número de páginas...');
        const { data: firstPageHtml } = await axios.get(entryUrl);
        const $ = cheerio.load(firstPageHtml);

        const paginationText = $('.pagination span').first().text(); // "Page 1 of 12"
        const totalPagesMatch = paginationText.match(/of (\d+)/);
        const totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1], 10) : 1;

        console.log(`[Animes Drive Parser] Total de páginas detectado: ${totalPages}`);

        for (let i = 1; i <= totalPages; i++) {
            pageUrlsToScrape.push(`${entryUrl}/page/${i}`);
        }
    } catch (error) {
        console.error('[Animes Drive Parser] Erro ao detectar paginação. Abortando.', error.message);
        return [];
    }

    // 2. Raspar todas as páginas de listagem para obter os links das páginas de anime.
    // Usamos Promise.all para fazer isso em paralelo e acelerar o processo.
    console.log('[Animes Drive Parser] Coletando links de todas as páginas de anime...');
    await Promise.all(pageUrlsToScrape.map(async (pageUrl) => {
        try {
            const { data: listHtml } = await axios.get(pageUrl);
            const $ = cheerio.load(listHtml);
            $('div.items.full article.item').each((index, element) => {
                const link = $(element).find('.poster a').attr('href');
                if (link && !allAnimePageLinks.includes(link)) {
                    allAnimePageLinks.push(link);
                }
            });
            console.log(`  -> Página ${pageUrl} processada.`);
        } catch (error) {
            console.warn(`  -> Falha ao processar página de lista: ${pageUrl}`);
        }
        await sleep(200); // Pequeno delay
    }));

    console.log(`[Animes Drive Parser] Total de ${allAnimePageLinks.length} páginas de anime para raspar.`);

    // 3. Raspar cada página de anime para obter os episódios.
    // E depois, para cada episódio, extrair a URL do vídeo.
    let finalResults = [];
    for (const animeLink of allAnimePageLinks) {
        const episodes = await scrapeAnimeDetailPage(animeLink);
        
        // 4. Agora, para cada episódio encontrado, vamos buscar a URL do vídeo
        for(const episode of episodes) {
            const videoUrl = await extractVideoStreamUrl(episode.sourcePageUrl);
            if(videoUrl) {
                finalResults.push({
                    animeTitle: episode.animeTitle,
                    seasonNumber: episode.seasonNumber,
                    episodeNumber: episode.episodeNumber,
                    // Aqui salvamos a URL final do vídeo, não a da página intermediária
                    streamUrl: videoUrl,
                });
            }
            await sleep(300); // Atraso para a requisição da página do player
        }

        await sleep(500); // Atraso entre o scraping de diferentes animes
    }

    console.log(`[Animes Drive Parser] Raspagem finalizada. Total de streams encontrados: ${finalResults.length}`);
    return finalResults;
}

module.exports = { parse };