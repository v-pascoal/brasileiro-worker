-- Conecte-se ao seu banco de dados antes de executar.

-- ========= CRIAÇÃO DO SCHEMA =========
-- Cria o schema 'streams' para organizar todas as tabelas relacionadas à busca de streams.
-- A cláusula 'IF NOT EXISTS' evita erros caso o schema já tenha sido criado.
CREATE SCHEMA IF NOT EXISTS streams;

-- Mensagem para confirmar a criação do schema
COMMENT ON SCHEMA streams IS 'Schema para agrupar tabelas que armazenam dados de streams para o addon Stremio "Brasileiro".';

-- ========= CRIAÇÃO DA TABELA DENTRO DO SCHEMA =========
-- Agora, criamos a tabela 'animes' especificando o schema 'streams'.
CREATE TABLE streams.animes (
    -- Chave primária: um identificador único para cada link de stream
    id SERIAL PRIMARY KEY,

    -- O identificador que o Stremio usa (ex: 'kitsu:9513', 'imdb:tt12345'). Essencial.
    stremio_id VARCHAR(100) NOT NULL,

    -- Número da temporada e do episódio
    season_number INT NOT NULL,
    episode_number INT NOT NULL,

    -- O título que será exibido para o usuário na lista de streams
    -- Ex: "Dublado 1080p - Fonte A", "Legendado 720p"
    stream_title VARCHAR(255) NOT NULL,

    -- O link direto para o vídeo (.mp4) ou o infohash/link magnético para torrents
    -- Usamos TEXT para acomodar URLs ou infohashes longos.
    stream_data TEXT NOT NULL,
    
    -- Um campo para diferenciar tipos de stream, se necessário (opcional mas útil)
    -- Ex: 'url' para links diretos, 'infohash' para torrents
    stream_type VARCHAR(20) DEFAULT 'url' NOT NULL,

    -- A fonte do link (útil para debug e manutenção)
    source_site VARCHAR(255),

    -- Data de criação e última atualização do registro
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ========= ÍNDICES PARA PERFORMANCE =========
-- A consulta mais comum será para encontrar um episódio específico.
-- Este índice composto acelera MUITO a busca.
CREATE INDEX idx_animes_stremio_season_episode ON streams.animes (stremio_id, season_number, episode_number);

-- Índice opcional para facilitar a manutenção por site de origem
CREATE INDEX idx_animes_source_site ON streams.animes (source_site);

-- ========= FUNÇÃO PARA ATUALIZAR 'last_updated_at' AUTOMATICAMENTE =========
-- Nota: A função é criada no schema 'public' por padrão, o que é aceitável,
-- ou pode ser criada no schema 'streams' se preferir manter tudo contido.
-- Vamos mantê-la no 'public' para simplicidade, a menos que você tenha muitas funções.

CREATE OR REPLACE FUNCTION public.update_last_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.last_updated_at = NOW(); 
   RETURN NEW;
END;
$$ language 'plpgsql';

-- ========= TRIGGER PARA A TABELA 'streams.animes' =========
-- O "trigger" que executa a função acima antes de cada UPDATE na tabela.
-- Note que o nome do trigger é único no banco, mas a referência é para a tabela específica.
CREATE TRIGGER update_streams_animes_last_updated
BEFORE UPDATE ON streams.animes
FOR EACH ROW
EXECUTE FUNCTION public.update_last_updated_at_column();

-- Mensagem de sucesso
COMMENT ON TABLE streams.animes IS 'Tabela para armazenar streams de animes para o addon Stremio "Brasileiro"';

-- Defina o 'search_path' para facilitar as consultas futuras (opcional, mas recomendado)
-- Faz com que você não precise digitar 'streams.' toda vez em suas queries.
-- Você pode definir isso na sua conexão de banco de dados ou por sessão.
-- Exemplo: SET search_path TO streams, public;