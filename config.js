/* config.js — dados públicos do seu projeto Supabase.
 *
 * Onde achar: Supabase → Project Settings → API
 *   - Project URL
 *   - chave pública (anon / publishable)  ← essa pode ficar no site.
 *
 * NUNCA coloque aqui a chave "service_role" (secreta).
 * A segurança vem das regras RLS do schema.sql: sem login, ninguém lê nada.
 *
 * Enquanto os valores abaixo não forem trocados, o site roda em MODO
 * DEMONSTRAÇÃO (dados fictícios guardados só no seu navegador).
 */
window.APP_CONFIG = {
    SUPABASE_URL: 'COLE_AQUI_A_URL_DO_PROJETO',
    SUPABASE_ANON_KEY: 'COLE_AQUI_A_CHAVE_PUBLICA'
};
