// src/scraper/parsers/site_animes_drive_parser.js
const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const puppeteer = require('puppeteer'); // <<< NOVA IMPORTAÇÃO
require('dotenv').config(); // <<< MUDANÇA: Garante que as variáveis de .env sejam carregadas

// --- CONFIGURAÇÃO DE PERFORMANCE ---
// Número de requisições que faremos simultaneamente. 
// Um valor entre 5 e 15 é seguro. Valores altos podem causar bloqueios de IP.
const CONCURRENCY_LIMIT = 10;

// Atraso em milissegundos entre os lotes de requisições para ser educado com o servidor.
const DELAY_BETWEEN_BATCHES = 500;

const DEV_LIMIT_LIST_PAGES = parseInt(process.env.DEV_LIMIT_LIST_PAGES, 10) || Infinity;
const DEV_LIMIT_ANIME_PAGES = parseInt(process.env.DEV_LIMIT_ANIME_PAGES, 10) || Infinity;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Função otimizada para raspar a página de detalhes de um anime.
 * Agora ela apenas coleta as "tarefas" (o que precisa ser feito) sem esperar por mais requisições.
 * @param {string} animePageUrl - A URL da página do anime
 * @returns {Promise<Array>} - Lista de tarefas de episódio a serem processadas.
 */
async function getEpisodeTasksFromDetailPage(animePageUrl) {
    const episodeTasks = [];
    try {
        const { data: detailHtml } = await axios.get(animePageUrl);
        const $ = cheerio.load(detailHtml);

        const animeTitle = $('div.sheader div.data > h1').text().trim();
        if (!animeTitle) return [];

        $('#episodes div.se-c').each((_, seasonElement) => {
            const seasonNumberMatch = $(seasonElement).find('.se-q .se-t').text().trim().match(/^(\d+)$/);
            const seasonNumber = seasonNumberMatch ? parseInt(seasonNumberMatch[1], 10) : 1;

            $(seasonElement).find('ul.episodios li').each((_, epElement) => {
                const episodeLinkElement = $(epElement).find('.episodiotitle a');
                const episodePageUrl = episodeLinkElement.attr('href');
                const episodeNumberText = $(epElement).find('.numerando').text();
                const episodeNumberMatch = episodeNumberText.match(/(\d+)$/);

                if (episodePageUrl && episodeNumberMatch) {
                    episodeTasks.push({
                        animeTitle,
                        seasonNumber,
                        episodeNumber: parseInt(episodeNumberMatch[0], 10),
                        sourcePageUrl: episodePageUrl,
                    });
                }
            });
        });

        // LOG ADICIONADO
        console.log(`   [DETALHE] ✔️  ${animeTitle} - Encontrados ${episodeTasks.length} episódios.`);

    } catch (error) {
        console.warn(`   [DETALHE] ⚠️  Falha ao raspar ${animePageUrl}: ${error.message}`);
    }
    return episodeTasks;
}

// Vamos criar e reutilizar uma única instância do navegador para performance.
let browserInstance;
async function getBrowser() {
    if (!browserInstance) {
        console.log('[Puppeteer] Iniciando nova instância do navegador...');
        browserInstance = await puppeteer.launch({
            headless: true, // true para rodar em segundo plano, 'new' para ver o que acontece
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Argumentos importantes para rodar em servidores
        });
    }
    return browserInstance;
}

/**
 * Função final que extrai a URL do vídeo .mp4 usando Puppeteer para lidar com JS.
 * @param {object} task - O objeto da tarefa com sourcePageUrl.
 * @returns {Promise<object|null>} - O objeto final com streamUrl ou null.
 */
async function processEpisodeTask(task) {
    console.log(`      [VÍDEO]  puppeteer.visitando: ${task.sourcePageUrl}`);
    const browser = await getBrowser();
    const page = await browser.newPage();
    let videoUrl = null;

    try {
        // Navega para a página do episódio
        await page.goto(task.sourcePageUrl, { waitUntil: 'networkidle2', timeout: 30000 });

        // Espera o seletor do iframe aparecer na página (até 10 segundos)
        // Este é o "sleep" inteligente que precisávamos. Ele espera pelo elemento.
        const iframeSelector = 'iframe.metaframe.rptss';
        await page.waitForSelector(iframeSelector, { timeout: 10000 });

        // Uma vez que o iframe existe, extrai o atributo 'src'
        const iframeSrc = await page.evaluate((selector) => {
            const iframe = document.querySelector(selector);
            return iframe ? iframe.getAttribute('src') : null;
        }, iframeSelector);

        if (iframeSrc) {
            console.log(`      [VÍDEO] -> Iframe encontrado: ${iframeSrc.substring(0, 70)}...`);
            const urlParams = new URL(iframeSrc).searchParams;
            const source = urlParams.get('source');
            if (source) {
                videoUrl = source;
                console.log(`      [VÍDEO] ✅ Sucesso! URL do vídeo extraída.`);
            } else {
                console.warn(`      [VÍDEO] ⚠️  AVISO: Parâmetro 'source' não encontrado na URL do iframe.`);
            }
        } else {
            console.warn(`      [VÍDEO] ⚠️  AVISO: Iframe não foi renderizado a tempo.`);
        }

    } catch (error) {
        console.error(`      [VÍDEO] ❌ ERRO com Puppeteer em ${task.sourcePageUrl}: ${error.message}`);
    } finally {
        // Fecha a aba para liberar memória, mas mantém o navegador aberto
        await page.close();
    }

    if (videoUrl) {
        return {
            animeTitle: task.animeTitle,
            seasonNumber: task.seasonNumber,
            episodeNumber: task.episodeNumber,
            streamUrl: videoUrl,
        };
    }

    return null;
}

async function parse(entryUrl) {
    console.log(`[Animes Drive Parser] Iniciando...`);
    // <<< MUDANÇA: Log para indicar se estamos em modo de teste
    if (DEV_LIMIT_LIST_PAGES !== Infinity || DEV_LIMIT_ANIME_PAGES !== Infinity) {
        console.warn(`[MODO DE TESTE ATIVADO] Limites: ${DEV_LIMIT_LIST_PAGES} pág. de lista, ${DEV_LIMIT_ANIME_PAGES} animes.`);
    }

    // --- FASE 1: Coleta de URLs (Rápido e Paralelo) ---
    console.log('[FASE 1] Coletando todas as páginas de anime...');

    let allAnimePageLinks = [];
    try {
        const { data: firstPageHtml } = await axios.get(entryUrl);
        const $ = cheerio.load(firstPageHtml);
        const paginationText = $('.pagination span').first().text();
        const totalPagesMatch = paginationText.match(/of (\d+)/);

        let totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1], 10) : 1;

        // <<< MUDANÇA: Aplica o limite de páginas de listagem
        if (totalPages > DEV_LIMIT_LIST_PAGES) {
            console.log(` -> Limite de desenvolvimento: Lendo ${DEV_LIMIT_LIST_PAGES} de ${totalPages} páginas.`);
            totalPages = DEV_LIMIT_LIST_PAGES;
        } else {
            console.log(` -> Detectadas ${totalPages} páginas de listagem.`);
        }

        const pageUrls = Array.from({ length: totalPages }, (_, i) => `${entryUrl}/page/${i + 1}`);

        const responses = await Promise.all(pageUrls.map(url => axios.get(url).catch(() => null)));

        for (const response of responses) {
            if (response && response.data) {
                const $page = cheerio.load(response.data);
                $page('div.items.full article.item .poster a').each((_, el) => {
                    allAnimePageLinks.push($page(el).attr('href'));
                });
            }
        }
        allAnimePageLinks = [...new Set(allAnimePageLinks)];

        // <<< MUDANÇA: Aplica o limite de animes a serem processados
        if (allAnimePageLinks.length > DEV_LIMIT_ANIME_PAGES) {
            console.log(` -> Limite de desenvolvimento: Processando ${DEV_LIMIT_ANIME_PAGES} de ${allAnimePageLinks.length} animes encontrados.`);
            allAnimePageLinks = allAnimePageLinks.slice(0, DEV_LIMIT_ANIME_PAGES);
        } else {
            console.log(` -> Encontrados ${allAnimePageLinks.length} animes únicos para processar.`);
        }


    } catch (error) {
        console.error('[Animes Drive Parser] Erro crítico na Fase 1. Abortando.', error.message);
        return [];
    }

    // --- FASE 2: Coleta de Tarefas de Episódio ---
    // (O resto do código permanece o mesmo, pois ele já trabalhará com a lista limitada 'allAnimePageLinks')
    console.log('\n[FASE 2] Coletando informações de todos os episódios...');
    const nestedTasks = await Promise.all(
        allAnimePageLinks.map(link => getEpisodeTasksFromDetailPage(link))
    );
    const allEpisodeTasks = nestedTasks.flat();
    console.log(` -> Total de ${allEpisodeTasks.length} tarefas de episódio coletadas.`);



    // --- FASE 3: Processamento Final em Lotes ---
    console.log(`\n[FASE 3] Iniciando processamento final em lotes de ${CONCURRENCY_LIMIT}...`);
    let finalResults = [];
    try {
        for (let i = 0; i < allEpisodeTasks.length; i += CONCURRENCY_LIMIT) {
            const chunk = allEpisodeTasks.slice(i, i + CONCURRENCY_LIMIT);

            console.log(` -> Processando lote ${Math.floor(i / CONCURRENCY_LIMIT) + 1} de ${Math.ceil(allEpisodeTasks.length / CONCURRENCY_LIMIT)} (Episódios ${i + 1} a ${i + chunk.length})`);

            const processedChunk = await Promise.all(chunk.map(task => processEpisodeTask(task)));

            finalResults.push(...processedChunk.filter(Boolean));

            await sleep(DELAY_BETWEEN_BATCHES);
        }
    } finally {
        // <<< MUDANÇA: Garante que o navegador seja fechado no final de tudo
        if (browserInstance) {
            console.log('[Puppeteer] Fechando instância do navegador...');
            await browserInstance.close();
            browserInstance = null; // Reseta a instância
        }
    }

    console.log(`\n[Animes Drive Parser] Raspagem finalizada. Total de ${finalResults.length} streams válidos encontrados.`);
    return finalResults;
}

module.exports = { parse };