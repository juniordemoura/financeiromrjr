# Meu Controle Financeiro

Dashboard pessoal para controlar os gastos do mês, com login só para o dono, banco **PostgreSQL no Supabase**, gráficos e alertas que se atualizam em tempo real. Funciona no notebook e no celular.

O visual é o mesmo da tela de login: vidro com blur sobre a madeira.

## O que ele faz

- **Login privado** (Supabase Auth) — sem cadastro público.
- **Lançamentos do dia a dia**: gastos e receitas, categorias, data, marcação de conta fixa.
- **Alertas** no topo da tela e avisos quando o status muda:
  - 🔴 **Vermelho**: passou do orçamento do mês ou o ritmo está mais de 10% acima do esperado.
  - 🟢 **Bom**: ritmo entre 90% e 110% do esperado.
  - 🏆 **Ótimo**: ritmo até 90% do esperado.
- **Quanto posso gastar hoje**, calculado com o que sobra do orçamento variável.
- **Estímulo**: sequência de dias dentro do limite, níveis, meta de economia e frase do dia.
- **Próximos meses**: previsão pela média, quanto sobra em 3/6/12 meses e dicas (regra 50/30/20, onde cortar 10%).
- **Gráficos**: gastos por categoria, acumulado × ritmo ideal, gasto de cada dia, últimos 6 meses + previsão.
- **Tempo real**: lançou no celular, o notebook atualiza sozinho.

### Como o ritmo é calculado

```
orçamento variável = orçamento do mês − contas fixas previstas
ritmo esperado hoje = orçamento variável × (dia atual ÷ dias do mês)
```

Contas fixas (aluguel, internet…) ficam de fora do ritmo diário. Assim, pagar o aluguel no dia 1 não deixa o mês "no vermelho". Marque **Conta fixa** ao lançar esse tipo de gasto.

## Passo a passo para colocar no ar

### 1. Criar o projeto no Supabase

Crie um projeto em [supabase.com](https://supabase.com) (plano gratuito serve).

### 2. Criar as tabelas

No Supabase: **SQL Editor → New query**, cole o conteúdo de `schema.sql` e clique em **Run**. Isso cria as tabelas `transacoes` e `configuracoes`, as regras de segurança (RLS) e liga o tempo real. Pode rodar de novo sem problema.

### 3. Criar o seu usuário

**Authentication → Users → Add user → Create new user.** Informe e-mail e senha e marque **Auto Confirm User**.

### 4. Fechar o cadastro para os outros

Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**. (Os nomes dos menus mudam de vez em quando; procure pela opção de permitir novos cadastros.) Mesmo sem isso, as regras RLS impedem que qualquer pessoa veja os seus dados, mas é melhor deixar fechado.

### 5. Preencher o `config.js`

Em **Project Settings → API**, copie a **Project URL** e a chave pública (**anon** ou **publishable**) para o `config.js`.

> Nunca coloque a chave `service_role` no site. Ela é secreta. A chave pública pode ficar no código porque quem protege os dados é o RLS.

### 6. Hospedar o site

O Supabase guarda o banco e o login, mas **não serve páginas HTML** (o Storage devolve HTML como texto puro por segurança). Hospede os arquivos em um serviço de sites estáticos:

- **GitHub Pages** (grátis): suba os arquivos no repositório, depois **Settings → Pages → Deploy from a branch → main / (root)**.
- Netlify ou Vercel também funcionam: é só arrastar a pasta.

### 7. Liberar o endereço no login (recuperar senha)

Em **Authentication → URL Configuration**, coloque o endereço do seu site em **Site URL** e adicione `https://SEU-ENDERECO/index.html` em **Redirect URLs**. Sem isso o link de "Esqueceu a senha?" não volta para o site.

### 8. Testar no seu computador (opcional)

```
python3 -m http.server 8000
```

Abra `http://localhost:8000`. Enquanto o `config.js` não for preenchido, o site roda em **modo demonstração**, com dados fictícios guardados só no navegador.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` + `login.js` | Tela de login, recuperar senha e nova senha |
| `dashboard.html` + `dashboard.css` + `dashboard.js` | Tela principal |
| `estilo.css` | Visual base (vidro sobre madeira) e login |
| `calc.js` | Regras: status, projeções, sequência, dicas (testável no Node) |
| `db.js` | Acesso ao Supabase (e modo demonstração) |
| `config.js` | URL e chave pública do seu projeto |
| `schema.sql` | Tabelas, RLS e tempo real |
| `imagem/fundo-madeira.jpg` | Fundo |

## Segurança

- Cada linha do banco tem `user_id` e as políticas RLS só liberam as linhas do usuário logado.
- O site não guarda senha; o Supabase cuida do login e renova a sessão sozinho.
- "Lembrar-me" desmarcado: a sessão some quando você fecha a aba.
