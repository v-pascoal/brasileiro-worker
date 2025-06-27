// src/scraper/sites.config.js

// Importa os parsers específicos para cada site.
const animesDriveParser = require('./parsers/site_animes_drive_parser');
const darkmahouParser = require('./parsers/site_darkmahou_parser');

const sites = [
    {
        name: "Animes Drive",
        // A página principal de onde começaremos a navegar
        entryUrl: "https://animesdrive.blog/tipo/legendado",
        // A função específica que sabe como raspar este site
        parser: animesDriveParser.parse,
        enabled: true // Permite desabilitar um scraper sem removê-lo
    },
    {
        name: "Darkmahou",
        entryUrl: "https://superanimes.biz/ultimos-adicionados",
        parser: darkmahouParser.parse,
        enabled: false // Desabilitado por padrão, mas pode ser ativado quando necessário
    },
    // Para adicionar um novo site no futuro, basta adicionar um novo objeto aqui.
];

// Exporta apenas os sites que estão habilitados.
module.exports = sites.filter(site => site.enabled);